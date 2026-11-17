import { Prisma } from '@prisma/client';
import { AppError, badRequest } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { scopeWhere } from '../lib/shopScope.js';
import type { ExpenseCategory, NonCreditPaymentMethod, PaymentMethod, Unit } from '../shared/enums.js';
import { createCustomer } from './customerService.js';
import { createExpense, updateExpense } from './expenseService.js';
import { adjustProductStock } from './inventoryService.js';
import { archiveProduct, createProduct, updateProduct } from './productService.js';
import { createPurchase } from './purchaseService.js';
import { createSale } from './saleService.js';
import { createSupplier } from './supplierService.js';

export type SyncOperationType =
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'ARCHIVE_PRODUCT'
  | 'ADJUST_STOCK'
  | 'CREATE_CUSTOMER'
  | 'CREATE_SUPPLIER'
  | 'CREATE_PURCHASE'
  | 'CREATE_SALE'
  | 'CREATE_EXPENSE'
  | 'UPDATE_EXPENSE';

export interface SyncPushOperationInput {
  id: string;
  operationType: SyncOperationType;
  entityId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface SyncPushOperationResult {
  id: string;
  entityId: string;
  status: 'APPLIED' | 'DUPLICATE' | 'REJECTED';
  warnings: string[];
  error?: string;
  data?: unknown;
}

function isPrimaryKeyDuplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function processSyncPush(
  shopId: string,
  operations: SyncPushOperationInput[],
): Promise<{ results: SyncPushOperationResult[]; serverTime: string }> {
  const results: SyncPushOperationResult[] = [];

  for (const op of operations) {
    try {
      const applied = await applySingleSyncOperation(shopId, op);
      results.push({
        id: op.id,
        entityId: op.entityId,
        status: applied.duplicate ? 'DUPLICATE' : 'APPLIED',
        warnings: applied.warnings,
        data: applied.data,
      });
    } catch (err) {
      if (isPrimaryKeyDuplicate(err)) {
        results.push({
          id: op.id,
          entityId: op.entityId,
          status: 'DUPLICATE',
          warnings: [],
        });
        continue;
      }

      if (err instanceof AppError) {
        if (err.code === 'DUPLICATE_SKU') {
          results.push({
            id: op.id,
            entityId: op.entityId,
            status: 'REJECTED',
            warnings: [],
            error: err.message,
          });
          continue;
        }
        results.push({
          id: op.id,
          entityId: op.entityId,
          status: 'REJECTED',
          warnings: [],
          error: err.message,
        });
        continue;
      }

      throw err;
    }
  }

  return {
    results,
    serverTime: new Date().toISOString(),
  };
}

async function applySingleSyncOperation(
  shopId: string,
  op: SyncPushOperationInput,
): Promise<{ duplicate: boolean; warnings: string[]; data?: unknown }> {
  const p = op.payload;

  switch (op.operationType) {
    case 'CREATE_PRODUCT': {
      const prisma = await ensurePrismaConnected();
      const existing = await prisma.product.findFirst({
        where: scopeWhere(shopId, { id: op.entityId }),
        select: { id: true },
      });
      if (existing) {
        return { duplicate: true, warnings: [] };
      }
      const created = await createProduct(shopId, {
        id: op.entityId,
        categoryId: (p.categoryId as string | null | undefined) ?? null,
        name: String(p.name ?? ''),
        sku: (p.sku as string | null | undefined) ?? null,
        description: (p.description as string | null | undefined) ?? null,
        unit: String(p.unit ?? 'PIECE') as Unit,
        purchaseCost: String(p.purchaseCost ?? '0'),
        sellingPrice: String(p.sellingPrice ?? '0'),
        initialQuantity: String(p.initialQuantity ?? '0'),
        minStockLevel: String(p.minStockLevel ?? '0'),
        imageUri: (p.imageUri as string | null | undefined) ?? null,
      });
      return { duplicate: false, warnings: [], data: created };
    }

    case 'UPDATE_PRODUCT': {
      const updated = await updateProduct(shopId, op.entityId, {
        categoryId: p.categoryId as string | null | undefined,
        name: p.name !== undefined ? String(p.name) : undefined,
        sku: p.sku as string | null | undefined,
        description: p.description as string | null | undefined,
        unit: p.unit !== undefined ? (String(p.unit) as Unit) : undefined,
        purchaseCost: p.purchaseCost !== undefined ? String(p.purchaseCost) : undefined,
        sellingPrice: p.sellingPrice !== undefined ? String(p.sellingPrice) : undefined,
        minStockLevel: p.minStockLevel !== undefined ? String(p.minStockLevel) : undefined,
        imageUri: p.imageUri as string | null | undefined,
      });
      return { duplicate: false, warnings: [], data: updated };
    }

    case 'ARCHIVE_PRODUCT': {
      const archived = await archiveProduct(shopId, op.entityId);
      return { duplicate: false, warnings: [], data: archived };
    }

    case 'ADJUST_STOCK': {
      const prisma = await ensurePrismaConnected();
      const existing = await prisma.stockMovement.findFirst({
        where: scopeWhere(shopId, { id: op.entityId }),
        select: { id: true },
      });
      if (existing) {
        return { duplicate: true, warnings: [] };
      }
      const res = await adjustProductStock(shopId, String(p.productId ?? ''), {
        id: op.entityId,
        type: String(p.type ?? 'ADJUSTMENT') as 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED',
        quantityChange: String(p.quantityChange ?? '0'),
        reason: String(p.reason ?? ''),
        occurredAt: p.occurredAt ? String(p.occurredAt) : undefined,
      });
      return { duplicate: false, warnings: [], data: res };
    }

    case 'CREATE_CUSTOMER': {
      const prisma = await ensurePrismaConnected();
      const existing = await prisma.customer.findFirst({
        where: scopeWhere(shopId, { id: op.entityId }),
        select: { id: true },
      });
      if (existing) {
        return { duplicate: true, warnings: [] };
      }
      const created = await createCustomer(shopId, {
        id: op.entityId,
        name: String(p.name ?? ''),
        phone: (p.phone as string | null | undefined) ?? null,
      });
      return { duplicate: false, warnings: [], data: created };
    }

    case 'CREATE_SUPPLIER': {
      const prisma = await ensurePrismaConnected();
      const existing = await prisma.supplier.findFirst({
        where: scopeWhere(shopId, { id: op.entityId }),
        select: { id: true },
      });
      if (existing) {
        return { duplicate: true, warnings: [] };
      }
      const created = await createSupplier(shopId, {
        id: op.entityId,
        name: String(p.name ?? ''),
        phone: (p.phone as string | null | undefined) ?? null,
        address: (p.address as string | null | undefined) ?? null,
        notes: (p.notes as string | null | undefined) ?? null,
      });
      return { duplicate: false, warnings: [], data: created };
    }

    case 'CREATE_PURCHASE': {
      const items = Array.isArray(p.items)
        ? (p.items as Array<Record<string, unknown>>).map((i) => ({
            id: i.id ? String(i.id) : undefined,
            productId: String(i.productId ?? ''),
            quantity: String(i.quantity ?? '0'),
            unitCost: String(i.unitCost ?? '0'),
          }))
        : [];
      const res = await createPurchase(shopId, {
        id: op.entityId,
        supplierId: String(p.supplierId ?? ''),
        idempotencyKey: op.idempotencyKey,
        amountPaid: p.amountPaid !== undefined ? String(p.amountPaid) : undefined,
        paymentMethod: p.paymentMethod ? String(p.paymentMethod) : undefined,
        occurredAt: p.occurredAt ? String(p.occurredAt) : undefined,
        note: (p.note as string | null | undefined) ?? null,
        items,
      });
      return { duplicate: res.idempotentReplay, warnings: [], data: res.purchase };
    }

    case 'CREATE_SALE': {
      const items = Array.isArray(p.items)
        ? (p.items as Array<Record<string, unknown>>).map((i) => ({
            id: i.id ? String(i.id) : undefined,
            movementId: i.movementId ? String(i.movementId) : undefined,
            productId: String(i.productId ?? ''),
            quantity: String(i.quantity ?? '0'),
            unitPrice: i.unitPrice !== undefined ? (i.unitPrice as string | number | null) : null,
          }))
        : [];
      const res = await createSale(shopId, {
        id: op.entityId,
        paymentId: p.paymentId ? String(p.paymentId) : undefined,
        customerId: (p.customerId as string | null | undefined) ?? null,
        idempotencyKey: op.idempotencyKey,
        discount: (p.discount as { type: 'AMOUNT' | 'PERCENT'; value: string | number } | null) ?? null,
        paymentMethod: String(p.paymentMethod ?? 'CASH') as PaymentMethod,
        amountReceived:
          p.amountReceived !== undefined ? (p.amountReceived as string | number | null) : undefined,
        occurredAt: p.occurredAt ? String(p.occurredAt) : undefined,
        note: (p.note as string | null | undefined) ?? null,
        fromSync: true,
        receiptNo: p.receiptNo ? String(p.receiptNo) : undefined,
        declaredTotal:
          p.declaredTotal !== undefined ? (p.declaredTotal as string | number) : undefined,
        items,
      });
      return {
        duplicate: res.idempotentReplay,
        warnings: res.sale.warnings ?? [],
        data: res.sale,
      };
    }

    case 'CREATE_EXPENSE': {
      const prisma = await ensurePrismaConnected();
      const existing = await prisma.expense.findFirst({
        where: scopeWhere(shopId, { id: op.entityId }),
        select: { id: true },
      });
      if (existing) {
        return { duplicate: true, warnings: [] };
      }
      const created = await createExpense(shopId, {
        id: op.entityId,
        title: String(p.title ?? ''),
        category: String(p.category ?? 'OTHER') as ExpenseCategory,
        amount: String(p.amount ?? '0'),
        expenseDate: String(p.expenseDate ?? new Date().toISOString()),
        paymentMethod: String(p.paymentMethod ?? 'CASH') as NonCreditPaymentMethod,
        description: (p.description as string | null | undefined) ?? null,
      });
      return { duplicate: false, warnings: [], data: created };
    }

    case 'UPDATE_EXPENSE': {
      const updated = await updateExpense(shopId, op.entityId, {
        title: p.title !== undefined ? String(p.title) : undefined,
        category: p.category !== undefined ? (String(p.category) as ExpenseCategory) : undefined,
        amount: p.amount !== undefined ? String(p.amount) : undefined,
        expenseDate: p.expenseDate !== undefined ? String(p.expenseDate) : undefined,
        paymentMethod:
          p.paymentMethod !== undefined
            ? (String(p.paymentMethod) as NonCreditPaymentMethod)
            : undefined,
        description: p.description as string | null | undefined,
      });
      return { duplicate: false, warnings: [], data: updated };
    }

    default:
      throw badRequest(`Unsupported sync operationType: ${String(op.operationType)}`);
  }
}

export async function processSyncPull(shopId: string, sinceIso?: string) {
  const prisma = await ensurePrismaConnected();
  const since = sinceIso ? new Date(sinceIso) : null;
  const serverTime = new Date().toISOString();

  const updatedFilter = since ? { updatedAt: { gte: since } } : {};
  const createdFilter = since ? { createdAt: { gte: since } } : {};

  const [shop, categories, products, customers, suppliers, sales, purchases, expenses] =
    await Promise.all([
      prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
      prisma.category.findMany({ where: scopeWhere(shopId) }),
      prisma.product.findMany({ where: { ...scopeWhere(shopId), ...updatedFilter } }),
      prisma.customer.findMany({ where: { ...scopeWhere(shopId), ...updatedFilter } }),
      prisma.supplier.findMany({ where: { ...scopeWhere(shopId), ...updatedFilter } }),
      prisma.sale.findMany({
        where: { ...scopeWhere(shopId), ...createdFilter },
        include: { items: true, payments: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      prisma.purchase.findMany({
        where: { ...scopeWhere(shopId), ...createdFilter },
        include: { items: true, payments: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      prisma.expense.findMany({
        where: { ...scopeWhere(shopId), ...updatedFilter },
        orderBy: { expenseDate: 'desc' },
        take: 200,
      }),
    ]);

  return {
    serverTime,
    shop: {
      id: shop.id,
      name: shop.name,
      currency: shop.currency,
      timezone: shop.timezone,
    },
    categories: categories.map((c) => ({
      id: c.id,
      shopId: c.shopId,
      name: c.name,
      createdAt: c.createdAt.toISOString(),
    })),
    products: products.map((p) => ({
      id: p.id,
      shopId: p.shopId,
      categoryId: p.categoryId,
      name: p.name,
      sku: p.sku,
      description: p.description,
      unit: p.unit,
      purchaseCost: p.purchaseCost.toString(),
      lastPurchaseCost: p.lastPurchaseCost.toString(),
      sellingPrice: p.sellingPrice.toString(),
      quantityOnHand: p.quantityOnHand.toString(),
      averageCost: p.averageCost.toString(),
      minStockLevel: p.minStockLevel.toString(),
      imageUri: p.imageUri,
      archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    customers: customers.map((c) => ({
      id: c.id,
      shopId: c.shopId,
      name: c.name,
      phone: c.phone,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      shopId: s.shopId,
      name: s.name,
      phone: s.phone,
      address: s.address,
      notes: s.notes,
      archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    sales: sales.map((s) => ({
      id: s.id,
      shopId: s.shopId,
      customerId: s.customerId,
      receiptNo: s.receiptNo,
      status: s.status,
      subtotal: s.subtotal.toString(),
      discountAmount: s.discountAmount.toString(),
      total: s.total.toString(),
      paymentMethod: s.paymentMethod,
      idempotencyKey: s.idempotencyKey,
      occurredAt: s.occurredAt.toISOString(),
      cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
      cancelReason: s.cancelReason,
      note: s.note,
      warnings: s.warnings,
      createdAt: s.createdAt.toISOString(),
      items: s.items.map((i) => ({
        id: i.id,
        saleId: i.saleId,
        productId: i.productId,
        productNameSnapshot: i.productNameSnapshot,
        unitSnapshot: i.unitSnapshot,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        lineSubtotal: i.lineSubtotal.toString(),
        allocatedDiscount: i.allocatedDiscount.toString(),
        lineNet: i.lineNet.toString(),
        unitCostSnapshot: i.unitCostSnapshot.toString(),
        lineCogs: i.lineCogs.toString(),
        createdAt: i.createdAt.toISOString(),
      })),
      payments: s.payments.map((pay) => ({
        id: pay.id,
        shopId: pay.shopId,
        kind: pay.kind,
        direction: pay.direction,
        method: pay.method,
        amount: pay.amount.toString(),
        paidAt: pay.paidAt.toISOString(),
        saleId: pay.saleId,
        purchaseId: pay.purchaseId,
        note: pay.note,
        createdAt: pay.createdAt.toISOString(),
      })),
    })),
    purchases: purchases.map((pur) => ({
      id: pur.id,
      shopId: pur.shopId,
      supplierId: pur.supplierId,
      total: pur.total.toString(),
      idempotencyKey: pur.idempotencyKey,
      occurredAt: pur.occurredAt.toISOString(),
      note: pur.note,
      createdAt: pur.createdAt.toISOString(),
      items: pur.items.map((i) => ({
        id: i.id,
        purchaseId: i.purchaseId,
        productId: i.productId,
        productNameSnapshot: i.productNameSnapshot,
        quantity: i.quantity.toString(),
        unitCost: i.unitCost.toString(),
        lineTotal: i.lineTotal.toString(),
      })),
      payments: pur.payments.map((pay) => ({
        id: pay.id,
        shopId: pay.shopId,
        kind: pay.kind,
        direction: pay.direction,
        method: pay.method,
        amount: pay.amount.toString(),
        paidAt: pay.paidAt.toISOString(),
        saleId: pay.saleId,
        purchaseId: pay.purchaseId,
        note: pay.note,
        createdAt: pay.createdAt.toISOString(),
      })),
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      shopId: e.shopId,
      title: e.title,
      category: e.category,
      amount: e.amount.toString(),
      expenseDate: e.expenseDate.toISOString(),
      paymentMethod: e.paymentMethod,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  };
}
