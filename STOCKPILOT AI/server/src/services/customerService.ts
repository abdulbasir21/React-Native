import { badRequest, unprocessable } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import { allocateOldestFirst, deriveSaleFinancials } from '../shared/calculations.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type NonCreditPaymentMethod,
  type PaymentDirection,
  type PaymentKind,
  type SaleStatus,
} from '../shared/enums.js';
import { cmpDecimal, dec, round2, sumMoney } from '../shared/money.js';
import { serializePayment } from './purchaseService.js';
import { getCustomerOutstandingMap, serializeSale } from './saleService.js';

function serializeCustomer(
  c: {
    id: string;
    shopId: string;
    name: string;
    phone: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  outstandingBalance = '0.00',
) {
  return {
    id: c.id,
    shopId: c.shopId,
    name: c.name,
    phone: c.phone,
    outstandingBalance,
    archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function listCustomers(
  shopId: string,
  options: { page: number; pageSize: number; search?: string; includeArchived?: boolean },
) {
  const prisma = await ensurePrismaConnected();
  const search = options.search?.trim();
  const where = scopeWhere(shopId, {
    ...(options.includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  });

  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  const balanceMap = await getCustomerOutstandingMap(
    shopId,
    rows.map((r) => r.id),
  );

  return {
    items: rows.map((r) => serializeCustomer(r, balanceMap.get(r.id) ?? '0.00')),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export async function getCustomerById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const customer = await prisma.customer.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  const verified = assertFoundInShop(customer, 'Customer');
  const balanceMap = await getCustomerOutstandingMap(shopId, [verified.id]);
  return serializeCustomer(verified, balanceMap.get(verified.id) ?? '0.00');
}

export async function createCustomer(
  shopId: string,
  input: { id?: string; name: string; phone?: string | null },
) {
  const prisma = await ensurePrismaConnected();
  const created = await prisma.customer.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      shopId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
    },
  });
  return serializeCustomer(created);
}

export async function updateCustomer(
  shopId: string,
  id: string,
  input: { name?: string; phone?: string | null },
) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.customer.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Customer');

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone === null ? null : input.phone.trim() || null }
        : {}),
    },
  });
  const balanceMap = await getCustomerOutstandingMap(shopId, [updated.id]);
  return serializeCustomer(updated, balanceMap.get(updated.id) ?? '0.00');
}

export async function archiveCustomer(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.customer.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Customer');

  const updated = await prisma.customer.update({
    where: { id },
    data: { archivedAt: existing!.archivedAt ?? new Date() },
  });
  const balanceMap = await getCustomerOutstandingMap(shopId, [updated.id]);
  return serializeCustomer(updated, balanceMap.get(updated.id) ?? '0.00');
}

/**
 * BR-PAY3, BR-PAY4, BR-PAY5:
 * Receives a lump-sum payment from a customer and allocates it oldest-first across
 * their COMPLETED sales with balanceDue > 0, creating one Payment row per sale in one transaction.
 */
export async function receiveCustomerPayment(
  shopId: string,
  customerId: string,
  input: {
    amount: string | number;
    method: string;
    paidAt?: string | Date;
    note?: string | null;
    paymentIds?: string[];
  },
) {
  const prisma = await ensurePrismaConnected();
  if (!input.method || !(NON_CREDIT_PAYMENT_METHODS as readonly string[]).includes(input.method)) {
    throw badRequest('method must be CASH, EASYPAISA, JAZZCASH, BANK_TRANSFER, or CARD', [
      { field: 'method' },
    ]);
  }
  const method = input.method as NonCreditPaymentMethod;

  let amountDec;
  try {
    amountDec = dec(input.amount);
  } catch {
    throw badRequest('Invalid payment amount', [{ field: 'amount' }]);
  }
  if (amountDec.lte(0)) {
    throw badRequest('Payment amount must be greater than 0', [{ field: 'amount' }]);
  }
  const amountStr = round2(amountDec);

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw badRequest('Invalid paidAt timestamp', [{ field: 'paidAt' }]);
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM customers
      WHERE id = ${customerId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    assertFoundInShop(locked[0], 'Customer');

    const sales = await tx.sale.findMany({
      where: scopeWhere(shopId, { customerId, status: 'COMPLETED' as SaleStatus }),
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        returns: { include: { items: true } },
        payments: {
          where: { kind: { in: ['SALE_PAYMENT', 'SALE_REFUND'] as PaymentKind[] } },
        },
      },
    });

    const openSales: Array<{ id: string; receiptNo: string; balanceDue: string }> = [];
    for (const s of sales) {
      const returnedValue = sumMoney(
        s.returns.flatMap((r) => r.items.map((i) => i.refundValue.toString())),
      );
      const fin = deriveSaleFinancials({
        total: s.total.toString(),
        returnedValue,
        status: s.status as SaleStatus,
        payments: s.payments.map((p) => ({
          kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
          amount: p.amount.toString(),
        })),
      });
      if (cmpDecimal(fin.balanceDue, 0) > 0) {
        openSales.push({ id: s.id, receiptNo: s.receiptNo, balanceDue: fin.balanceDue });
      }
    }

    const totalOutstanding = sumMoney(openSales.map((s) => s.balanceDue));
    if (dec(amountStr).gt(dec(totalOutstanding))) {
      throw unprocessable(
        'PAYMENT_EXCEEDS_BALANCE',
        `Payment ${amountStr} exceeds customer outstanding balance ${totalOutstanding}`,
        [{ field: 'amount' }],
      );
    }

    const allocations = allocateOldestFirst(
      openSales.map((s) => ({ id: s.id, balanceDue: s.balanceDue })),
      amountStr,
    );

    const createdPayments = [];
    for (let i = 0; i < allocations.length; i += 1) {
      const alloc = allocations[i]!;
      const paymentId = input.paymentIds?.[i];
      const payment = await tx.payment.create({
        data: {
          ...(paymentId ? { id: paymentId } : {}),
          shopId,
          kind: 'SALE_PAYMENT' as PaymentKind,
          direction: 'IN' as PaymentDirection,
          method,
          amount: alloc.amount,
          paidAt,
          saleId: alloc.targetId,
          note: input.note?.trim() || null,
        },
      });
      createdPayments.push(serializePayment(payment));
    }

    return {
      customerId,
      amountApplied: amountStr,
      outstandingBefore: totalOutstanding,
      outstandingAfter: round2(dec(totalOutstanding).minus(amountStr)),
      allocations: allocations.map((a) => ({
        saleId: a.targetId,
        receiptNo: openSales.find((s) => s.id === a.targetId)?.receiptNo ?? '',
        amount: a.amount,
      })),
      payments: createdPayments,
    };
  });
}

export async function listCustomerSales(shopId: string, customerId: string) {
  const prisma = await ensurePrismaConnected();
  const customer = await prisma.customer.findFirst({
    where: scopeWhere(shopId, { id: customerId }),
  });
  assertFoundInShop(customer, 'Customer');

  const sales = await prisma.sale.findMany({
    where: scopeWhere(shopId, { customerId }),
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      customer: { select: { id: true, name: true, phone: true, archivedAt: true } },
      items: { orderBy: { createdAt: 'asc' } },
      returns: { include: { items: true }, orderBy: { occurredAt: 'desc' } },
      payments: { orderBy: { paidAt: 'asc' } },
    },
  });

  return sales.map((s) => serializeSale(s));
}

export async function listCustomerPayments(shopId: string, customerId: string) {
  const prisma = await ensurePrismaConnected();
  const customer = await prisma.customer.findFirst({
    where: scopeWhere(shopId, { id: customerId }),
  });
  assertFoundInShop(customer, 'Customer');

  const payments = await prisma.payment.findMany({
    where: {
      shopId,
      sale: { shopId, customerId },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  });

  return payments.map(serializePayment);
}
