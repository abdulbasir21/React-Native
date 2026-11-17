import type { SQLiteDatabase } from 'expo-sqlite';
import {
  allocateDiscount,
  applyDiscount,
  formatReceiptNo,
  lineCogs,
  lineSubtotal,
  weightedAverage,
  type DiscountInput,
} from '../shared/calculations';
import type { ExpenseCategory, NonCreditPaymentMethod, PaymentMethod, Unit } from '../shared/enums';
import { dec, round2, round3, round4, sumMoney, validateQuantityForUnit } from '../shared/money';
import { generateClientId } from '../lib/ids';
import { getLocalDb } from './sqlite';
import {
  costToMicro,
  intToMoney,
  microToCost,
  milliToQty,
  moneyToInt,
  qtyToMilli,
} from './sqliteMath';
import type { OutboxEntry, OutboxOperationType, OutboxStatus } from '../sync/outboxStateMachine';

type Txn = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

async function ensureSyncState(txn: Txn, shopId: string): Promise<{ nextSeq: number }> {
  const row = await txn.getFirstAsync<{ next_seq: number }>(
    'SELECT next_seq FROM sync_state WHERE shop_id = ?',
    shopId,
  );
  if (row) {
    return { nextSeq: row.next_seq };
  }
  await txn.runAsync(
    'INSERT INTO sync_state (shop_id, last_pulled_at, last_successful_sync_at, initial_pull_completed, next_seq) VALUES (?, NULL, NULL, 0, 1)',
    shopId,
  );
  return { nextSeq: 1 };
}

async function enqueueOutbox(
  txn: Txn,
  params: {
    shopId: string;
    operationType: OutboxOperationType;
    entityType: string;
    entityId: string;
    dependsOnEntityId?: string | null;
    idempotencyKey: string;
    payload: unknown;
    nowIso: string;
  },
): Promise<OutboxEntry> {
  const { nextSeq } = await ensureSyncState(txn, params.shopId);
  await txn.runAsync(
    'UPDATE sync_state SET next_seq = ? WHERE shop_id = ?',
    nextSeq + 1,
    params.shopId,
  );

  const id = generateClientId();
  const payloadJson = JSON.stringify(params.payload);
  await txn.runAsync(
    `INSERT INTO sync_outbox (
      id, seq, shop_id, operation_type, entity_type, entity_id,
      depends_on_entity_id, idempotency_key, payload_json, status,
      attempts, last_error, next_retry_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, NULL, ?, ?)`,
    id,
    nextSeq,
    params.shopId,
    params.operationType,
    params.entityType,
    params.entityId,
    params.dependsOnEntityId ?? null,
    params.idempotencyKey,
    payloadJson,
    params.nowIso,
    params.nowIso,
  );

  return {
    id,
    seq: nextSeq,
    shopId: params.shopId,
    operationType: params.operationType,
    entityType: params.entityType,
    entityId: params.entityId,
    dependsOnEntityId: params.dependsOnEntityId ?? null,
    idempotencyKey: params.idempotencyKey,
    payloadJson,
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    nextRetryAt: null,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}

export async function createLocalProduct(
  shopId: string,
  input: {
    id?: string;
    categoryId?: string | null;
    name: string;
    sku?: string | null;
    description?: string | null;
    unit: Unit;
    purchaseCost: string;
    sellingPrice: string;
    initialQuantity?: string;
    minStockLevel?: string;
    imageUri?: string | null;
  },
) {
  const db = await getLocalDb();
  const id = input.id ?? generateClientId();
  const nowIso = new Date().toISOString();
  const initialQty = input.initialQuantity ?? '0';
  const minStock = input.minStockLevel ?? '0';
  const unitCheck = validateQuantityForUnit(initialQty, input.unit);
  if (!unitCheck.valid) {
    throw new Error(unitCheck.reason ?? 'Invalid initial quantity');
  }

  const purchaseCost = round2(input.purchaseCost);
  const sellingPrice = round2(input.sellingPrice);
  const avgCost = round4(purchaseCost);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO products (
        id, shop_id, category_id, name, sku, description, unit,
        purchase_cost_cents, last_purchase_cost_cents, selling_price_cents,
        quantity_milli, average_cost_micro, min_stock_milli, image_uri,
        archived_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      id,
      shopId,
      input.categoryId ?? null,
      input.name.trim(),
      input.sku?.trim() || null,
      input.description?.trim() || null,
      input.unit,
      moneyToInt(purchaseCost),
      moneyToInt(purchaseCost),
      moneyToInt(sellingPrice),
      qtyToMilli(initialQty),
      costToMicro(avgCost),
      qtyToMilli(minStock),
      input.imageUri ?? null,
      nowIso,
      nowIso,
    );

    if (dec(initialQty).gt(0)) {
      const movId = generateClientId();
      await txn.runAsync(
        `INSERT INTO stock_movements (
          id, shop_id, product_id, type, quantity_change_milli,
          previous_qty_milli, new_qty_milli, reason, occurred_at, created_at
        ) VALUES (?, ?, ?, 'INITIAL_STOCK', ?, 0, ?, 'Initial stock on product creation', ?, ?)`,
        movId,
        shopId,
        id,
        qtyToMilli(initialQty),
        qtyToMilli(initialQty),
        nowIso,
        nowIso,
      );
    }

    await enqueueOutbox(txn, {
      shopId,
      operationType: 'CREATE_PRODUCT',
      entityType: 'product',
      entityId: id,
      idempotencyKey: id,
      payload: {
        id,
        categoryId: input.categoryId ?? null,
        name: input.name.trim(),
        sku: input.sku?.trim() || null,
        description: input.description?.trim() || null,
        unit: input.unit,
        purchaseCost,
        sellingPrice,
        initialQuantity: round3(initialQty),
        minStockLevel: round3(minStock),
        imageUri: input.imageUri ?? null,
      },
      nowIso,
    });
  });

  return { id, name: input.name.trim(), quantityOnHand: round3(initialQty), averageCost: avgCost };
}

export async function adjustLocalStock(
  shopId: string,
  productId: string,
  input: {
    id?: string;
    type: 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED';
    quantityChange: string;
    reason: string;
    occurredAt?: string;
  },
) {
  const db = await getLocalDb();
  const id = input.id ?? generateClientId();
  const nowIso = input.occurredAt ?? new Date().toISOString();
  if (!input.reason.trim()) {
    throw new Error('Reason is required for stock adjustment');
  }
  const changeDec = dec(input.quantityChange);
  if (changeDec.eq(0)) {
    throw new Error('Quantity change cannot be zero');
  }

  return db.withExclusiveTransactionAsync(async (txn) => {
    const product = await txn.getFirstAsync<{
      id: string;
      unit: Unit;
      quantity_milli: number;
    }>('SELECT id, unit, quantity_milli FROM products WHERE id = ? AND shop_id = ?', productId, shopId);
    if (!product) {
      throw new Error('Product not found');
    }
    const unitCheck = validateQuantityForUnit(changeDec.abs(), product.unit);
    if (!unitCheck.valid) {
      throw new Error(unitCheck.reason ?? 'Invalid quantity precision');
    }

    const prevQty = dec(milliToQty(product.quantity_milli));
    const newQty = prevQty.plus(changeDec);
    if (newQty.lt(0)) {
      throw new Error('Insufficient stock for adjustment');
    }

    await txn.runAsync(
      'UPDATE products SET quantity_milli = ?, updated_at = ? WHERE id = ? AND shop_id = ?',
      qtyToMilli(newQty.toString()),
      nowIso,
      productId,
      shopId,
    );

    await txn.runAsync(
      `INSERT INTO stock_movements (
        id, shop_id, product_id, type, quantity_change_milli,
        previous_qty_milli, new_qty_milli, reason, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      shopId,
      productId,
      input.type,
      qtyToMilli(changeDec.toString()),
      product.quantity_milli,
      qtyToMilli(newQty.toString()),
      input.reason.trim(),
      nowIso,
      nowIso,
    );

    await enqueueOutbox(txn, {
      shopId,
      operationType: 'ADJUST_STOCK',
      entityType: 'stock_movement',
      entityId: id,
      dependsOnEntityId: productId,
      idempotencyKey: id,
      payload: {
        id,
        productId,
        type: input.type,
        quantityChange: round3(changeDec),
        reason: input.reason.trim(),
        occurredAt: nowIso,
      },
      nowIso,
    });
  });
}

export async function createLocalExpense(
  shopId: string,
  input: {
    id?: string;
    title: string;
    category: ExpenseCategory;
    amount: string;
    expenseDate: string;
    paymentMethod: NonCreditPaymentMethod;
    description?: string | null;
  },
) {
  const db = await getLocalDb();
  const id = input.id ?? generateClientId();
  const nowIso = new Date().toISOString();
  if (dec(input.amount).lte(0)) {
    throw new Error('Expense amount must be > 0');
  }
  const amount = round2(input.amount);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO expenses (
        id, shop_id, title, category, amount_cents, expense_date,
        payment_method, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      shopId,
      input.title.trim(),
      input.category,
      moneyToInt(amount),
      input.expenseDate,
      input.paymentMethod,
      input.description?.trim() || null,
      nowIso,
      nowIso,
    );

    await enqueueOutbox(txn, {
      shopId,
      operationType: 'CREATE_EXPENSE',
      entityType: 'expense',
      entityId: id,
      idempotencyKey: id,
      payload: {
        id,
        title: input.title.trim(),
        category: input.category,
        amount,
        expenseDate: input.expenseDate,
        paymentMethod: input.paymentMethod,
        description: input.description?.trim() || null,
      },
      nowIso,
    });
  });

  return { id, amount };
}

export async function createLocalPurchase(
  shopId: string,
  input: {
    id?: string;
    supplierId: string;
    idempotencyKey: string;
    amountPaid?: string;
    paymentMethod?: NonCreditPaymentMethod | null;
    occurredAt?: string;
    note?: string | null;
    items: Array<{ productId: string; quantity: string; unitCost: string }>;
  },
) {
  const db = await getLocalDb();
  const purchaseId = input.id ?? generateClientId();
  const nowIso = input.occurredAt ?? new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const supplier = await txn.getFirstAsync<{ id: string; archived_at: string | null }>(
      'SELECT id, archived_at FROM suppliers WHERE id = ? AND shop_id = ?',
      input.supplierId,
      shopId,
    );
    if (!supplier || supplier.archived_at !== null) {
      throw new Error('Active supplier required');
    }

    const lineTotals: string[] = [];
    const preparedLines: Array<{
      itemId: string;
      movementId: string;
      productId: string;
      name: string;
      quantity: string;
      unitCost: string;
      lineTotal: string;
      prevQtyMilli: number;
      newQtyMilli: number;
      newAvgCostMicro: number;
    }> = [];

    for (const item of input.items) {
      const prod = await txn.getFirstAsync<{
        id: string;
        name: string;
        unit: Unit;
        quantity_milli: number;
        average_cost_micro: number;
      }>(
        'SELECT id, name, unit, quantity_milli, average_cost_micro FROM products WHERE id = ? AND shop_id = ?',
        item.productId,
        shopId,
      );
      if (!prod) throw new Error(`Product ${item.productId} not found`);

      const lineTotal = lineSubtotal(item.quantity, item.unitCost);
      lineTotals.push(lineTotal);

      const prevQty = milliToQty(prod.quantity_milli);
      const prevAvg = microToCost(prod.average_cost_micro);
      const newAvg = weightedAverage(prevQty, prevAvg, item.quantity, item.unitCost);
      const newQty = dec(prevQty).plus(dec(item.quantity));

      preparedLines.push({
        itemId: generateClientId(),
        movementId: generateClientId(),
        productId: prod.id,
        name: prod.name,
        quantity: round3(item.quantity),
        unitCost: round2(item.unitCost),
        lineTotal,
        prevQtyMilli: prod.quantity_milli,
        newQtyMilli: qtyToMilli(newQty.toString()),
        newAvgCostMicro: costToMicro(newAvg),
      });
    }

    const total = sumMoney(lineTotals);
    const paid = round2(input.amountPaid ?? '0');
    if (dec(paid).lt(0) || dec(paid).gt(dec(total))) {
      throw new Error('Invalid amountPaid for purchase');
    }
    if (dec(paid).gt(0) && !input.paymentMethod) {
      throw new Error('paymentMethod required when amountPaid > 0');
    }

    await txn.runAsync(
      `INSERT INTO purchases (
        id, shop_id, supplier_id, total_cents, idempotency_key, occurred_at, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      purchaseId,
      shopId,
      input.supplierId,
      moneyToInt(total),
      input.idempotencyKey,
      nowIso,
      input.note ?? null,
      nowIso,
    );

    for (const line of preparedLines) {
      await txn.runAsync(
        `INSERT INTO purchase_items (
          id, purchase_id, product_id, product_name_snapshot, quantity_milli, unit_cost_cents, line_total_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        line.itemId,
        purchaseId,
        line.productId,
        line.name,
        qtyToMilli(line.quantity),
        moneyToInt(line.unitCost),
        moneyToInt(line.lineTotal),
      );

      await txn.runAsync(
        `UPDATE products
         SET quantity_milli = ?, average_cost_micro = ?, last_purchase_cost_cents = ?, updated_at = ?
         WHERE id = ? AND shop_id = ?`,
        line.newQtyMilli,
        line.newAvgCostMicro,
        moneyToInt(line.unitCost),
        nowIso,
        line.productId,
        shopId,
      );

      await txn.runAsync(
        `INSERT INTO stock_movements (
          id, shop_id, product_id, type, quantity_change_milli,
          previous_qty_milli, new_qty_milli, purchase_id, occurred_at, created_at
        ) VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?)`,
        line.movementId,
        shopId,
        line.productId,
        qtyToMilli(line.quantity),
        line.prevQtyMilli,
        line.newQtyMilli,
        purchaseId,
        nowIso,
        nowIso,
      );
    }

    if (dec(paid).gt(0) && input.paymentMethod) {
      await txn.runAsync(
        `INSERT INTO payments (
          id, shop_id, kind, direction, method, amount_cents, paid_at, purchase_id, created_at
        ) VALUES (?, ?, 'PURCHASE_PAYMENT', 'OUT', ?, ?, ?, ?, ?)`,
        generateClientId(),
        shopId,
        input.paymentMethod,
        moneyToInt(paid),
        nowIso,
        purchaseId,
        nowIso,
      );
    }

    await enqueueOutbox(txn, {
      shopId,
      operationType: 'CREATE_PURCHASE',
      entityType: 'purchase',
      entityId: purchaseId,
      dependsOnEntityId: preparedLines[0]?.productId ?? null,
      idempotencyKey: input.idempotencyKey,
      payload: {
        id: purchaseId,
        supplierId: input.supplierId,
        idempotencyKey: input.idempotencyKey,
        amountPaid: paid,
        paymentMethod: input.paymentMethod ?? null,
        occurredAt: nowIso,
        note: input.note ?? null,
        items: preparedLines.map((l) => ({
          id: l.itemId,
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      },
      nowIso,
    });
  });

  return { id: purchaseId };
}

export async function createLocalSale(
  shopId: string,
  input: {
    id?: string;
    paymentId?: string;
    customerId?: string | null;
    idempotencyKey: string;
    discount?: DiscountInput | null;
    paymentMethod: PaymentMethod;
    amountReceived?: string | null;
    occurredAt?: string;
    note?: string | null;
    items: Array<{
      id?: string;
      movementId?: string;
      productId: string;
      quantity: string;
      unitPrice?: string | null;
    }>;
  },
) {
  const db = await getLocalDb();
  const saleId = input.id ?? generateClientId();
  const paymentId = input.paymentId ?? generateClientId();
  const now = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const nowIso = now.toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (input.items.length === 0) {
      throw new Error('Sale must have at least 1 item');
    }

    const lineSubtotals: string[] = [];
    const prepared: Array<{
      itemId: string;
      movementId: string;
      productId: string;
      name: string;
      unit: Unit;
      quantity: string;
      unitPrice: string;
      lineSubtotal: string;
      unitCostSnapshot: string;
      lineCogs: string;
      prevQtyMilli: number;
      newQtyMilli: number;
    }> = [];

    for (const item of input.items) {
      const prod = await txn.getFirstAsync<{
        id: string;
        name: string;
        unit: Unit;
        selling_price_cents: number;
        quantity_milli: number;
        average_cost_micro: number;
        archived_at: string | null;
      }>(
        'SELECT id, name, unit, selling_price_cents, quantity_milli, average_cost_micro, archived_at FROM products WHERE id = ? AND shop_id = ?',
        item.productId,
        shopId,
      );
      if (!prod || prod.archived_at !== null) {
        throw new Error(`Active product ${item.productId} not found`);
      }

      const unitCheck = validateQuantityForUnit(item.quantity, prod.unit);
      if (!unitCheck.valid) {
        throw new Error(unitCheck.reason ?? 'Invalid quantity for unit');
      }

      const prevQty = dec(milliToQty(prod.quantity_milli));
      const reqQty = dec(item.quantity);
      const newQty = prevQty.minus(reqQty);
      if (newQty.lt(0)) {
        throw new Error(`Insufficient stock for ${prod.name}`);
      }

      const unitPrice =
        item.unitPrice !== undefined && item.unitPrice !== null
          ? round2(item.unitPrice)
          : intToMoney(prod.selling_price_cents);
      const sub = lineSubtotal(item.quantity, unitPrice);
      const unitCostSnap = microToCost(prod.average_cost_micro);
      const cogs = lineCogs(item.quantity, unitCostSnap);

      lineSubtotals.push(sub);
      prepared.push({
        itemId: item.id ?? generateClientId(),
        movementId: item.movementId ?? generateClientId(),
        productId: prod.id,
        name: prod.name,
        unit: prod.unit,
        quantity: round3(item.quantity),
        unitPrice,
        lineSubtotal: sub,
        unitCostSnapshot: unitCostSnap,
        lineCogs: cogs,
        prevQtyMilli: prod.quantity_milli,
        newQtyMilli: qtyToMilli(newQty.toString()),
      });
    }

    const subtotal = sumMoney(lineSubtotals);
    const { discountAmount, total } = applyDiscount(subtotal, input.discount);
    const allocations = allocateDiscount(lineSubtotals, discountAmount);

    const amountReceived =
      input.paymentMethod === 'CREDIT'
        ? '0.00'
        : input.amountReceived !== undefined && input.amountReceived !== null
          ? round2(input.amountReceived)
          : total;

    if (input.paymentMethod !== 'CREDIT' && dec(amountReceived).lte(0) && dec(total).gt(0)) {
      throw new Error('Non-CREDIT sale requires amountReceived > 0');
    }
    const appliedPaid = dec(amountReceived).gt(dec(total)) ? total : amountReceived;
    if (dec(appliedPaid).lt(dec(total)) && !input.customerId) {
      throw new Error('Customer is required when sale has an unpaid balance');
    }

    const existingToday = await txn.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM sales WHERE shop_id = ? AND substr(occurred_at, 1, 10) = substr(?, 1, 10)",
      shopId,
      nowIso,
    );
    const receiptNo = formatReceiptNo(nowIso.slice(0, 10).replace(/-/g, ''), (existingToday?.c ?? 0) + 1);

    await txn.runAsync(
      `INSERT INTO sales (
        id, shop_id, customer_id, receipt_no, status, subtotal_cents,
        discount_amount_cents, total_cents, payment_method, idempotency_key,
        occurred_at, note, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      saleId,
      shopId,
      input.customerId ?? null,
      receiptNo,
      moneyToInt(subtotal),
      moneyToInt(discountAmount),
      moneyToInt(total),
      input.paymentMethod,
      input.idempotencyKey,
      nowIso,
      input.note ?? null,
      nowIso,
    );

    for (let i = 0; i < prepared.length; i += 1) {
      const line = prepared[i]!;
      const alloc = allocations[i]!;
      const allocDisc = alloc.allocatedDiscount;
      const lineNet = alloc.lineNet;

      await txn.runAsync(
        `INSERT INTO sale_items (
          id, sale_id, product_id, product_name_snapshot, unit_snapshot,
          quantity_milli, unit_price_cents, line_subtotal_cents, allocated_discount_cents,
          line_net_cents, unit_cost_snapshot_micro, line_cogs_cents, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        line.itemId,
        saleId,
        line.productId,
        line.name,
        line.unit,
        qtyToMilli(line.quantity),
        moneyToInt(line.unitPrice),
        moneyToInt(line.lineSubtotal),
        moneyToInt(allocDisc),
        moneyToInt(lineNet),
        costToMicro(line.unitCostSnapshot),
        moneyToInt(line.lineCogs),
        nowIso,
      );

      await txn.runAsync(
        'UPDATE products SET quantity_milli = ?, updated_at = ? WHERE id = ? AND shop_id = ?',
        line.newQtyMilli,
        nowIso,
        line.productId,
        shopId,
      );

      await txn.runAsync(
        `INSERT INTO stock_movements (
          id, shop_id, product_id, type, quantity_change_milli,
          previous_qty_milli, new_qty_milli, sale_id, occurred_at, created_at
        ) VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?, ?)`,
        line.movementId,
        shopId,
        line.productId,
        -qtyToMilli(line.quantity),
        line.prevQtyMilli,
        line.newQtyMilli,
        saleId,
        nowIso,
        nowIso,
      );
    }

    if (dec(appliedPaid).gt(0)) {
      await txn.runAsync(
        `INSERT INTO payments (
          id, shop_id, kind, direction, method, amount_cents, paid_at, sale_id, created_at
        ) VALUES (?, ?, 'SALE_PAYMENT', 'IN', ?, ?, ?, ?, ?)`,
        paymentId,
        shopId,
        input.paymentMethod,
        moneyToInt(appliedPaid),
        nowIso,
        saleId,
        nowIso,
      );
    }

    await enqueueOutbox(txn, {
      shopId,
      operationType: 'CREATE_SALE',
      entityType: 'sale',
      entityId: saleId,
      dependsOnEntityId: prepared[0]?.productId ?? null,
      idempotencyKey: input.idempotencyKey,
      payload: {
        id: saleId,
        paymentId,
        customerId: input.customerId ?? null,
        idempotencyKey: input.idempotencyKey,
        receiptNo,
        declaredTotal: total,
        discount: input.discount ?? null,
        paymentMethod: input.paymentMethod,
        amountReceived: appliedPaid,
        occurredAt: nowIso,
        note: input.note ?? null,
        items: prepared.map((l) => ({
          id: l.itemId,
          movementId: l.movementId,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      },
      nowIso,
    });
  });

  return { id: saleId };
}

export async function listLocalOutboxEntries(shopId: string): Promise<OutboxEntry[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{
    id: string;
    seq: number;
    shop_id: string;
    operation_type: OutboxOperationType;
    entity_type: string;
    entity_id: string;
    depends_on_entity_id: string | null;
    idempotency_key: string;
    payload_json: string;
    status: OutboxStatus;
    attempts: number;
    last_error: string | null;
    next_retry_at: number | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM sync_outbox WHERE shop_id = ? ORDER BY seq ASC', shopId);

  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    shopId: r.shop_id,
    operationType: r.operation_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    dependsOnEntityId: r.depends_on_entity_id,
    idempotencyKey: r.idempotency_key,
    payloadJson: r.payload_json,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    nextRetryAt: r.next_retry_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getLocalSyncState(shopId: string) {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{
    shop_id: string;
    last_pulled_at: string | null;
    last_successful_sync_at: string | null;
    initial_pull_completed: number;
    next_seq: number;
  }>('SELECT * FROM sync_state WHERE shop_id = ?', shopId);
  if (!row) {
    return {
      shopId,
      lastPulledAt: null,
      lastSuccessfulSyncAt: null,
      initialPullCompleted: false,
      nextSeq: 1,
    };
  }
  return {
    shopId: row.shop_id,
    lastPulledAt: row.last_pulled_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    initialPullCompleted: row.initial_pull_completed === 1,
    nextSeq: row.next_seq,
  };
}
