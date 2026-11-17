import { Prisma } from '@prisma/client';
import { badRequest } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type ExpenseCategory,
  type NonCreditPaymentMethod,
} from '../shared/enums.js';
import {
  customDateRangeBounds,
  isExpenseDateAllowed,
  periodBounds,
  type ReportPeriod,
} from '../shared/calculations.js';
import { dec, formatMoney, round2 } from '../shared/money.js';

export function serializeExpense(e: {
  id: string;
  shopId: string;
  title: string;
  category: string;
  amount: { toString(): string };
  expenseDate: Date;
  paymentMethod: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    shopId: e.shopId,
    title: e.title,
    category: e.category as ExpenseCategory,
    amount: formatMoney(e.amount.toString()),
    expenseDate: e.expenseDate.toISOString(),
    paymentMethod: e.paymentMethod as NonCreditPaymentMethod,
    description: e.description,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function validateExpenseAmount(raw: string): string {
  let d;
  try {
    d = dec(raw);
  } catch {
    throw badRequest('Invalid expense amount', [{ field: 'amount' }]);
  }
  if (d.lte(0)) {
    throw badRequest('Expense amount must be > 0', [{ field: 'amount' }]);
  }
  return round2(d);
}

function validateExpenseMethod(method: string): NonCreditPaymentMethod {
  if (!NON_CREDIT_PAYMENT_METHODS.includes(method as NonCreditPaymentMethod)) {
    throw badRequest('Expense paymentMethod cannot be CREDIT', [{ field: 'paymentMethod' }]);
  }
  return method as NonCreditPaymentMethod;
}

function validateExpenseDateInShopTimezone(rawDate: string, timeZone: string): Date {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest('Invalid expenseDate timestamp', [{ field: 'expenseDate' }]);
  }
  if (!isExpenseDateAllowed(parsed, timeZone)) {
    throw badRequest('Expense date cannot be later than tomorrow in shop timezone', [
      { field: 'expenseDate' },
    ]);
  }
  return parsed;
}

export async function listExpenses(
  shopId: string,
  options: {
    page: number;
    pageSize: number;
    search?: string;
    category?: ExpenseCategory;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  },
) {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: { timezone: true },
  });

  let dateFilter: Prisma.DateTimeFilter | undefined;
  if (options.period) {
    const bounds = periodBounds(options.period, shop.timezone);
    dateFilter = { gte: bounds.startUtc, lt: bounds.endUtc };
  } else if (options.from && options.to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(options.from) && /^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
      const bounds = customDateRangeBounds(options.from, options.to, shop.timezone);
      dateFilter = { gte: bounds.startUtc, lt: bounds.endUtc };
    } else {
      dateFilter = { gte: new Date(options.from), lte: new Date(options.to) };
    }
  }

  const search = options.search?.trim();
  const where: Prisma.ExpenseWhereInput = scopeWhere(shopId, {
    ...(options.category ? { category: options.category } : {}),
    ...(dateFilter ? { expenseDate: dateFilter } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  });

  const [total, rows, agg] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    items: rows.map(serializeExpense),
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalAmount: formatMoney(agg._sum.amount?.toString() ?? '0'),
    },
  };
}

export async function getExpenseById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const row = await prisma.expense.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  return serializeExpense(assertFoundInShop(row, 'Expense'));
}

export async function createExpense(
  shopId: string,
  input: {
    id?: string;
    title: string;
    category: ExpenseCategory;
    amount: string;
    expenseDate: string;
    paymentMethod: string;
    description?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: { timezone: true },
  });

  const amount = validateExpenseAmount(input.amount);
  const paymentMethod = validateExpenseMethod(input.paymentMethod);
  const expenseDate = validateExpenseDateInShopTimezone(input.expenseDate, shop.timezone);

  const created = await prisma.expense.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      shopId,
      title: input.title.trim(),
      category: input.category,
      amount,
      expenseDate,
      paymentMethod,
      description: input.description?.trim() || null,
    },
  });

  return serializeExpense(created);
}

export async function updateExpense(
  shopId: string,
  id: string,
  input: {
    title?: string;
    category?: ExpenseCategory;
    amount?: string;
    expenseDate?: string;
    paymentMethod?: string;
    description?: string | null;
    reason?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findFirst({
      where: scopeWhere(shopId, { id }),
    });
    const current = assertFoundInShop(existing, 'Expense');

    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { timezone: true },
    });

    const data: Prisma.ExpenseUpdateInput = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.category !== undefined) data.category = input.category;
    if (input.amount !== undefined) data.amount = validateExpenseAmount(input.amount);
    if (input.paymentMethod !== undefined) {
      data.paymentMethod = validateExpenseMethod(input.paymentMethod);
    }
    if (input.expenseDate !== undefined) {
      data.expenseDate = validateExpenseDateInShopTimezone(input.expenseDate, shop.timezone);
    }
    if (input.description !== undefined) {
      data.description = input.description === null ? null : input.description.trim() || null;
    }

    const updated = await tx.expense.update({
      where: { id: current.id },
      data,
    });

    // BR-E2: write AuditLog with before and after in the same transaction
    await tx.auditLog.create({
      data: {
        shopId,
        entityType: 'EXPENSE',
        entityId: current.id,
        action: 'UPDATE',
        before: serializeExpense(current) as unknown as Prisma.InputJsonValue,
        after: serializeExpense(updated) as unknown as Prisma.InputJsonValue,
        reason: input.reason?.trim() || null,
        actor: 'OWNER',
      },
    });

    return serializeExpense(updated);
  });
}
