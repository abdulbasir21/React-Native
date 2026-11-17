import { Prisma } from '@prisma/client';
import { getEnv } from '../config/env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import type { ExpenseCategory, NonCreditPaymentMethod, PaymentMethod, Unit } from '../shared/enums.js';
import { dec, round2 } from '../shared/money.js';
import { clearShopAiCache } from './aiCache.js';
import { createExpense } from './expenseService.js';
import { createProduct, updateProduct } from './productService.js';
import { createPurchase } from './purchaseService.js';
import { createSale } from './saleService.js';

export const AI_ACTION_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes (BR-AI4)

export const AI_WRITE_TOOLS = [
  'createProduct',
  'updateProduct',
  'recordSale',
  'recordPurchase',
  'recordExpense',
] as const;

export type AIWriteToolName = (typeof AI_WRITE_TOOLS)[number];

export interface ProposeActionInput {
  shopId: string;
  conversationId?: string | null;
  toolName: AIWriteToolName;
  args: Record<string, unknown>;
  summary: string;
  estimatedAmount?: string | null;
  priceChangeRatio?: number | null;
  strongConfirmTarget?: string | null;
  now?: Date;
}

export function serializeActionLog(row: {
  id: string;
  shopId: string;
  conversationId: string | null;
  toolName: string;
  args: unknown;
  summary: string;
  requiresStrongConfirm: boolean;
  strongConfirmTarget: string | null;
  status: string;
  result: unknown;
  error: string | null;
  expiresAt: Date;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    shopId: row.shopId,
    conversationId: row.conversationId,
    toolName: row.toolName,
    args: row.args as Record<string, unknown>,
    summary: row.summary,
    requiresStrongConfirm: row.requiresStrongConfirm,
    strongConfirmTarget: row.strongConfirmTarget,
    status: row.status,
    result: row.result,
    error: row.error,
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function proposeAction(input: ProposeActionInput) {
  const prisma = await ensurePrismaConnected();
  const env = getEnv();
  const threshold = dec(env.AI_STRONG_CONFIRM_AMOUNT);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + AI_ACTION_EXPIRY_MS);

  const amountTriggersStrong =
    input.estimatedAmount !== undefined &&
    input.estimatedAmount !== null &&
    dec(input.estimatedAmount).gte(threshold);

  const priceRatioTriggersStrong =
    input.priceChangeRatio !== undefined &&
    input.priceChangeRatio !== null &&
    input.priceChangeRatio > 0.5;

  const requiresStrongConfirm = amountTriggersStrong || priceRatioTriggersStrong;

  const created = await prisma.aIActionLog.create({
    data: {
      shopId: input.shopId,
      conversationId: input.conversationId ?? null,
      toolName: input.toolName,
      args: input.args as Prisma.InputJsonValue,
      summary: input.summary,
      requiresStrongConfirm,
      strongConfirmTarget: requiresStrongConfirm ? (input.strongConfirmTarget ?? null) : null,
      status: 'PENDING',
      expiresAt,
    },
  });

  return serializeActionLog(created);
}

export async function expireStaleActions(shopId: string, now: Date = new Date()) {
  const prisma = await ensurePrismaConnected();
  const res = await prisma.aIActionLog.updateMany({
    where: {
      ...scopeWhere(shopId),
      status: 'PENDING',
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  });
  return res.count;
}

export async function rejectAction(shopId: string, actionId: string) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.aIActionLog.findFirst({
    where: scopeWhere(shopId, { id: actionId }),
  });
  const action = assertFoundInShop(existing, 'AI action');

  if (action.status === 'REJECTED') {
    return serializeActionLog(action);
  }
  if (action.status === 'CONFIRMED') {
    throw conflict('ALREADY_CONFIRMED', 'Confirmed action cannot be rejected');
  }
  if (action.status === 'EXPIRED' || action.expiresAt <= new Date()) {
    await prisma.aIActionLog.update({
      where: { id: action.id },
      data: { status: 'EXPIRED' },
    });
    throw conflict('ACTION_EXPIRED', 'Action has expired');
  }

  const updated = await prisma.aIActionLog.update({
    where: { id: action.id },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
    },
  });

  return serializeActionLog(updated);
}

function matchesStrongConfirm(target: string | null, provided: string | undefined): boolean {
  if (!target) return true;
  if (!provided) return false;
  const normTarget = target.trim();
  const normProvided = provided.trim();
  if (normTarget.toLowerCase() === normProvided.toLowerCase()) {
    return true;
  }
  // Numeric match for money threshold (e.g. "50000" == "50000.00")
  try {
    return dec(normTarget).eq(dec(normProvided));
  } catch {
    return false;
  }
}

export async function confirmAction(
  shopId: string,
  actionId: string,
  confirmInput?: string,
  now: Date = new Date(),
) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.aIActionLog.findFirst({
    where: scopeWhere(shopId, { id: actionId }),
  });
  if (!existing) {
    throw notFound('AI action not found');
  }

  // BR-AI5: Confirming the same action twice executes it once and returns the same result.
  if (existing.status === 'CONFIRMED') {
    return serializeActionLog(existing);
  }
  if (existing.status === 'REJECTED') {
    throw conflict('ACTION_REJECTED', 'Rejected action cannot be confirmed');
  }
  if (existing.status === 'EXPIRED' || existing.expiresAt <= now) {
    await prisma.aIActionLog.update({
      where: { id: existing.id },
      data: { status: 'EXPIRED' },
    });
    throw conflict('ACTION_EXPIRED', 'Action proposal has expired (10 minute limit)');
  }
  if (existing.status !== 'PENDING') {
    throw conflict('INVALID_ACTION_STATUS', `Cannot confirm action in status ${existing.status}`);
  }

  // BR-AI6: Strong confirmation check
  if (
    existing.requiresStrongConfirm &&
    !matchesStrongConfirm(existing.strongConfirmTarget, confirmInput)
  ) {
    throw badRequest(
      `Strong confirmation required: please re-enter "${existing.strongConfirmTarget}"`,
      [{ field: 'confirmInput' }],
    );
  }

  const args = existing.args as Record<string, unknown>;
  let result: unknown;

  try {
    switch (existing.toolName as AIWriteToolName) {
      case 'createProduct': {
        result = await createProduct(shopId, {
          name: String(args.name),
          categoryId: (args.categoryId as string | null | undefined) ?? null,
          sku: (args.sku as string | null | undefined) ?? null,
          unit: (args.unit as Unit | undefined) ?? 'PIECE',
          purchaseCost: round2(String(args.purchaseCost ?? '0')),
          sellingPrice: round2(String(args.sellingPrice)),
          initialQuantity:
            args.initialQuantity !== undefined ? String(args.initialQuantity) : '0',
          minStockLevel: args.minStockLevel !== undefined ? String(args.minStockLevel) : '0',
        });
        break;
      }

      case 'updateProduct': {
        result = await updateProduct(shopId, String(args.productId), {
          name: args.name !== undefined ? String(args.name) : undefined,
          purchaseCost:
            args.purchaseCost !== undefined ? round2(String(args.purchaseCost)) : undefined,
          sellingPrice:
            args.sellingPrice !== undefined ? round2(String(args.sellingPrice)) : undefined,
          minStockLevel:
            args.minStockLevel !== undefined ? String(args.minStockLevel) : undefined,
        });
        break;
      }

      case 'recordSale': {
        const items = Array.isArray(args.items)
          ? (args.items as Array<Record<string, unknown>>).map((i) => ({
              productId: String(i.productId),
              quantity: String(i.quantity),
              unitPrice: i.unitPrice !== undefined ? String(i.unitPrice) : undefined,
            }))
          : [];
        const saleRes = await createSale(shopId, {
          customerId: (args.customerId as string | null | undefined) ?? null,
          idempotencyKey: existing.id, // BR-AI5: action ID as idempotency key
          paymentMethod: String(args.paymentMethod ?? 'CASH') as PaymentMethod,
          amountReceived:
            args.amountReceived !== undefined ? String(args.amountReceived) : undefined,
          discount:
            (args.discount as { type: 'AMOUNT' | 'PERCENT'; value: string | number } | null) ??
            null,
          note: (args.note as string | null | undefined) ?? null,
          items,
        });
        result = saleRes.sale;
        break;
      }

      case 'recordPurchase': {
        const items = Array.isArray(args.items)
          ? (args.items as Array<Record<string, unknown>>).map((i) => ({
              productId: String(i.productId),
              quantity: String(i.quantity),
              unitCost: String(i.unitCost),
            }))
          : [];
        const purRes = await createPurchase(shopId, {
          supplierId: String(args.supplierId),
          idempotencyKey: existing.id, // BR-AI5: action ID as idempotency key
          amountPaid: args.amountPaid !== undefined ? String(args.amountPaid) : '0',
          paymentMethod: (args.paymentMethod as NonCreditPaymentMethod | undefined) ?? undefined,
          note: (args.note as string | null | undefined) ?? null,
          items,
        });
        result = purRes.purchase;
        break;
      }

      case 'recordExpense': {
        result = await createExpense(shopId, {
          title: String(args.title),
          category: String(args.category ?? 'OTHER') as ExpenseCategory,
          amount: round2(String(args.amount)),
          expenseDate: String(args.expenseDate ?? now.toISOString()),
          paymentMethod: String(args.paymentMethod ?? 'CASH') as NonCreditPaymentMethod,
          description: (args.description as string | null | undefined) ?? null,
        });
        break;
      }

      default:
        throw badRequest(`Unsupported AI write tool: ${existing.toolName}`);
    }

    clearShopAiCache(shopId);

    const updated = await prisma.aIActionLog.update({
      where: { id: existing.id },
      data: {
        status: 'CONFIRMED',
        result: result as Prisma.InputJsonValue,
        confirmedAt: now,
      },
    });
    return serializeActionLog(updated);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution failed';
    await prisma.aIActionLog.update({
      where: { id: existing.id },
      data: {
        status: 'FAILED',
        error: errMsg,
      },
    });
    throw err;
  }
}
