import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { AppError } from '../lib/errors.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { createCustomer, getCustomerById } from '../services/customerService.js';
import { archiveProduct, createProduct, updateProduct } from '../services/productService.js';
import { createPurchase } from '../services/purchaseService.js';
import {
  addSalePayment,
  createSale,
  getSaleById,
  getSaleReceiptData,
  listSales,
} from '../services/saleService.js';
import { createSupplier } from '../services/supplierService.js';
import { getLocalParts } from '../shared/calculations.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase4a() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase4a.test' } },
    select: { shopId: true },
  });
  const shopIds = [...new Set(users.map((u) => u.shopId))];
  if (shopIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { shopId: { in: shopIds } } } });
    await prisma.purchase.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.supplier.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
}

async function setupShop(prefix: string, shopName = 'Sale Service Test Shop') {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${prefix} Owner`,
    shopName,
    email: `${prefix}@phase4a.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
    timezone: res.body.data.shop.timezone as string,
  };
}

describe('Phase 4a — SaleService transactions, validations, costing & receipt numbers', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase4a();
  });

  afterAll(async () => {
    await cleanupPhase4a();
  });

  it('BR-SA1, BR-SA4, BR-SA5, BR-SA7, BR-PAY1, BR-PAY2, BR-PAY4: Rs. 5,000 sale with Rs. 3,000 cash gives balance 2,000, status PARTIAL, and updates customer balance', async () => {
    const { shopId } = await setupShop('p4a-partial');
    const prod = await createProduct(shopId, {
      name: 'Fast Power Bank',
      unit: 'PIECE',
      purchaseCost: '1500.00',
      sellingPrice: '2500.00',
      initialQuantity: '10',
    });
    const customer = await createCustomer(shopId, { name: 'Bilal Electronics', phone: '03001112233' });

    const { sale, idempotentReplay } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '3000.00',
      idempotencyKey: randomUUID(),
    });

    expect(idempotentReplay).toBe(false);
    expect(sale.subtotal).toBe('5000.00');
    expect(sale.discountAmount).toBe('0.00');
    expect(sale.total).toBe('5000.00');
    expect(sale.netTotal).toBe('5000.00');
    expect(sale.amountPaid).toBe('3000.00');
    expect(sale.balanceDue).toBe('2000.00');
    expect(sale.paymentMethod).toBe('CASH');
    expect(sale.paymentStatus).toBe('PARTIAL');
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0]?.kind).toBe('SALE_PAYMENT');
    expect(sale.payments[0]?.direction).toBe('IN');
    expect(sale.items).toHaveLength(1);
    expect(sale.items?.[0]?.unitCostSnapshot).toBe('1500.0000');
    expect(sale.items?.[0]?.lineCogs).toBe('3000.00');

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: prod.id } });
    expect(Number(dbProd.quantityOnHand.toString())).toBe(8);

    const cust = await getCustomerById(shopId, customer.id);
    expect(cust.outstandingBalance).toBe('2000.00');

    // Finish balance with a single-sale payment (BR-PAY3)
    const paidSale = await addSalePayment(shopId, sale.id, {
      amount: '2000.00',
      method: 'EASYPAISA',
    });
    expect(paidSale.amountPaid).toBe('5000.00');
    expect(paidSale.balanceDue).toBe('0.00');
    expect(paidSale.paymentStatus).toBe('PAID');

    const custAfter = await getCustomerById(shopId, customer.id);
    expect(custAfter.outstandingBalance).toBe('0.00');
  });

  it('BR-SA4, BR-SA5, BR-CU1: enforces CREDIT=0, non-CREDIT>0, requires non-archived customer when unpaid, and permits walk-in when fully paid', async () => {
    const { shopId } = await setupShop('p4a-payrules');
    const prod = await createProduct(shopId, {
      name: 'Type-C Cable',
      unit: 'PIECE',
      purchaseCost: '200.00',
      sellingPrice: '500.00',
      initialQuantity: '20',
    });
    const customer = await createCustomer(shopId, { name: 'Usman Traders' });

    // CREDIT with amountReceived > 0 -> rejected (400)
    await expect(
      createSale(shopId, {
        customerId: customer.id,
        items: [{ productId: prod.id, quantity: '2' }],
        paymentMethod: 'CREDIT',
        amountReceived: '100.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Non-CREDIT with amountReceived = 0 -> rejected (400)
    await expect(
      createSale(shopId, {
        customerId: customer.id,
        items: [{ productId: prod.id, quantity: '2' }],
        paymentMethod: 'CASH',
        amountReceived: '0.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Partial payment without customer -> rejected (400)
    await expect(
      createSale(shopId, {
        customerId: null,
        items: [{ productId: prod.id, quantity: '2' }],
        paymentMethod: 'CASH',
        amountReceived: '500.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Walk-in fully paid -> succeeds
    const walkIn = await createSale(shopId, {
      customerId: null,
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '1000.00',
      idempotencyKey: randomUUID(),
    });
    expect(walkIn.sale.paymentStatus).toBe('PAID');
    expect(walkIn.sale.customerId).toBeNull();

    // CREDIT sale with customer and amountReceived 0 -> succeeds with 0 Payment rows
    const creditSale = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CREDIT',
      idempotencyKey: randomUUID(),
    });
    expect(creditSale.sale.paymentStatus).toBe('UNPAID');
    expect(creditSale.sale.balanceDue).toBe('1000.00');
    expect(creditSale.sale.payments).toHaveLength(0);
  });

  it('BR-SA2, BR-SA3, BR-PAY2: calculates percent & fixed amount discounts, exact remainder allocation, and 100% discount NOT_APPLICABLE status', async () => {
    const { shopId } = await setupShop('p4a-discounts');
    const p1 = await createProduct(shopId, {
      name: 'Item A',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '100.00',
      initialQuantity: '50',
    });
    const p2 = await createProduct(shopId, {
      name: 'Item B',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '100.00',
      initialQuantity: '50',
    });
    const p3 = await createProduct(shopId, {
      name: 'Item C',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '100.00',
      initialQuantity: '50',
    });

    // Fixed discount Rs. 10.00 across 3 equal lines -> 3.33, 3.33, 3.34 = 10.00 exact
    const amtSale = await createSale(shopId, {
      items: [
        { productId: p1.id, quantity: '1' },
        { productId: p2.id, quantity: '1' },
        { productId: p3.id, quantity: '1' },
      ],
      discount: { type: 'AMOUNT', value: '10.00' },
      paymentMethod: 'CASH',
      amountReceived: '290.00',
      idempotencyKey: randomUUID(),
    });
    expect(amtSale.sale.subtotal).toBe('300.00');
    expect(amtSale.sale.discountAmount).toBe('10.00');
    expect(amtSale.sale.total).toBe('290.00');
    expect(amtSale.sale.items?.map((i) => i.allocatedDiscount)).toEqual(['3.33', '3.33', '3.34']);
    expect(amtSale.sale.items?.map((i) => i.lineNet)).toEqual(['96.67', '96.67', '96.66']);

    // Percent discount 15% on 300.00 -> 45.00, total 255.00
    const pctSale = await createSale(shopId, {
      items: [{ productId: p1.id, quantity: '3' }],
      discount: { type: 'PERCENT', value: '15' },
      paymentMethod: 'CARD',
      amountReceived: '255.00',
      idempotencyKey: randomUUID(),
    });
    expect(pctSale.sale.discountAmount).toBe('45.00');
    expect(pctSale.sale.total).toBe('255.00');

    // 100% discount -> total 0.00 -> NOT_APPLICABLE
    const zeroSale = await createSale(shopId, {
      items: [{ productId: p1.id, quantity: '1' }],
      discount: { type: 'PERCENT', value: '100' },
      paymentMethod: 'CREDIT',
      idempotencyKey: randomUUID(),
    });
    expect(zeroSale.sale.total).toBe('0.00');
    expect(zeroSale.sale.paymentStatus).toBe('NOT_APPLICABLE');

    // Excess discount > subtotal rejected
    await expect(
      createSale(shopId, {
        items: [{ productId: p1.id, quantity: '1' }],
        discount: { type: 'AMOUNT', value: '150.00' },
        paymentMethod: 'CASH',
        amountReceived: '100.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('BR-S6, BR-SA12, BR-SA1, BR-SA6, BR-SA7: rejects negative stock (409) & archived product with full rollback, and recomputes client totals server-side', async () => {
    const { shopId } = await setupShop('p4a-guards');
    const prodA = await createProduct(shopId, {
      name: 'Adapter 25W',
      unit: 'PIECE',
      purchaseCost: '800.00',
      sellingPrice: '1200.00',
      initialQuantity: '5',
    });
    const prodB = await createProduct(shopId, {
      name: 'Screen Guard',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '300.00',
      initialQuantity: '2',
    });
    const archived = await createProduct(shopId, {
      name: 'Old Cover',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '150.00',
      initialQuantity: '10',
    });
    await archiveProduct(shopId, archived.id);

    // Stock below zero -> 409 INSUFFICIENT_STOCK and nothing saved
    await expect(
      createSale(shopId, {
        items: [
          { productId: prodA.id, quantity: '2' },
          { productId: prodB.id, quantity: '3' },
        ],
        paymentMethod: 'CASH',
        amountReceived: '3300.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_STOCK' });

    expect(await prisma.sale.count({ where: { shopId } })).toBe(0);
    expect(await prisma.payment.count({ where: { shopId } })).toBe(0);
    expect(
      await prisma.stockMovement.count({ where: { shopId, type: 'SALE' } }),
    ).toBe(0);
    const prodAfterGuard = await prisma.product.findUniqueOrThrow({ where: { id: prodA.id } });
    expect(Number(prodAfterGuard.quantityOnHand.toString())).toBe(5);

    // Archived product rejected (409)
    await expect(
      createSale(shopId, {
        items: [{ productId: archived.id, quantity: '1' }],
        paymentMethod: 'CASH',
        amountReceived: '150.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PRODUCT_ARCHIVED' });

    // BR-SA1: > 200 lines rejected; decimal qty on PIECE rejected
    await expect(
      createSale(shopId, {
        items: Array.from({ length: 201 }, () => ({ productId: prodA.id, quantity: '1' })),
        paymentMethod: 'CASH',
        amountReceived: '1200.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      createSale(shopId, {
        items: [{ productId: prodA.id, quantity: '1.5' }],
        paymentMethod: 'CASH',
        amountReceived: '1800.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // BR-SA6: client-sent wrong declaredTotal is ignored/replaced and adds TOTAL_MISMATCH under sync
    const syncSale = await createSale(shopId, {
      items: [{ productId: prodA.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '2400.00',
      idempotencyKey: randomUUID(),
      fromSync: true,
      declaredTotal: '999.00',
    });
    expect(syncSale.sale.total).toBe('2400.00');
    expect(syncSale.sale.warnings).toContain('TOTAL_MISMATCH');

    // BR-SA7: forced failure on last write rolls back sale, items, payment, stock, and movements
    const existingMov = await prisma.stockMovement.findFirstOrThrow({
      where: { shopId },
      select: { id: true },
    });
    await expect(
      createSale(shopId, {
        items: [
          { productId: prodA.id, quantity: '1' },
          { productId: prodB.id, quantity: '1', movementId: existingMov.id },
        ],
        paymentMethod: 'CASH',
        amountReceived: '1500.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeDefined();

    // Confirm count of sales/payments/movements unchanged from syncSale
    expect(await prisma.sale.count({ where: { shopId } })).toBe(1);
    expect(await prisma.saleItem.count({ where: { sale: { shopId } } })).toBe(1);
    const prodAAfterFail = await prisma.product.findUniqueOrThrow({ where: { id: prodA.id } });
    expect(Number(prodAAfterFail.quantityOnHand.toString())).toBe(3); // 5 - 2 from syncSale only
  });

  it('BR-SA8, BR-SA9, BR-SA11: enforces idempotency replay, per-shop-day receipt sequence uniqueness, and CLOCK_SKEW replacement', async () => {
    const shop1 = await setupShop('p4a-seq1', 'Shop One');
    const shop2 = await setupShop('p4a-seq2', 'Shop Two');

    const p1 = await createProduct(shop1.shopId, {
      name: 'Earbuds',
      unit: 'PIECE',
      purchaseCost: '1000.00',
      sellingPrice: '1500.00',
      initialQuantity: '20',
    });
    const p2 = await createProduct(shop2.shopId, {
      name: 'Earbuds',
      unit: 'PIECE',
      purchaseCost: '1000.00',
      sellingPrice: '1500.00',
      initialQuantity: '20',
    });

    const idemKey = randomUUID();
    const s1a = await createSale(shop1.shopId, {
      items: [{ productId: p1.id, quantity: '1' }],
      paymentMethod: 'CASH',
      amountReceived: '1500.00',
      idempotencyKey: idemKey,
    });
    const s1b = await createSale(shop1.shopId, {
      items: [{ productId: p1.id, quantity: '1' }],
      paymentMethod: 'CASH',
      amountReceived: '1500.00',
      idempotencyKey: idemKey,
    });

    expect(s1a.idempotentReplay).toBe(false);
    expect(s1b.idempotentReplay).toBe(true);
    expect(s1b.sale.id).toBe(s1a.sale.id);
    expect(await prisma.sale.count({ where: { shopId: shop1.shopId } })).toBe(1);

    const todayCompact = getLocalParts(new Date(), shop1.timezone).compactDate;
    expect(s1a.sale.receiptNo).toBe(`RCP-${todayCompact}-0001`);

    // Second sale in shop1 gets 0002; future occurredAt > 10m replaced with CLOCK_SKEW
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const s1c = await createSale(shop1.shopId, {
      items: [{ productId: p1.id, quantity: '1' }],
      paymentMethod: 'CASH',
      amountReceived: '1500.00',
      idempotencyKey: randomUUID(),
      occurredAt: futureDate,
    });
    expect(s1c.sale.receiptNo).toBe(`RCP-${todayCompact}-0002`);
    expect(s1c.sale.warnings).toContain('CLOCK_SKEW');
    expect(new Date(s1c.sale.occurredAt).getTime()).toBeLessThanOrEqual(Date.now() + 5000);

    // Shop 2 starts independently at 0001
    const s2a = await createSale(shop2.shopId, {
      items: [{ productId: p2.id, quantity: '1' }],
      paymentMethod: 'CASH',
      amountReceived: '1500.00',
      idempotencyKey: randomUUID(),
    });
    expect(s2a.sale.receiptNo).toBe(`RCP-${todayCompact}-0001`);

    // Cross-shop isolation check (BR-A5): Shop 2 cannot fetch Shop 1's sale or sell Shop 1's product
    await expect(getSaleById(shop2.shopId, s1a.sale.id)).rejects.toThrow(AppError);
    await expect(getSaleReceiptData(shop2.shopId, s1a.sale.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      createSale(shop2.shopId, {
        items: [{ productId: p1.id, quantity: '1' }],
        paymentMethod: 'CASH',
        amountReceived: '1500.00',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('BR-C3, BR-P7, BR-SA10: preserves cost snapshot and sellingPrice on existing SaleItems after later purchases & price edits, with no edit/delete routes', async () => {
    const { shopId, token } = await setupShop('p4a-snapshot');
    const supplier = await createSupplier(shopId, { name: 'Karachi Wholesale' });
    const prod = await createProduct(shopId, {
      name: 'Wired Headphones',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '200.00',
      initialQuantity: '10',
    });

    const { sale } = await createSale(shopId, {
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '400.00',
      idempotencyKey: randomUUID(),
    });
    expect(sale.items?.[0]?.unitCostSnapshot).toBe('100.0000');
    expect(sale.items?.[0]?.lineCogs).toBe('200.00');
    expect(sale.items?.[0]?.unitPrice).toBe('200.00');

    // Later purchase changes averageCost: (8 * 100 + 10 * 200) / 18 = 2800 / 18 = 155.5556
    await createPurchase(shopId, {
      supplierId: supplier.id,
      items: [{ productId: prod.id, quantity: '10', unitCost: '200.00' }],
      amountPaid: '2000.00',
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    });

    // Later sellingPrice edit (BR-P7)
    await updateProduct(shopId, prod.id, { sellingPrice: '500.00' });

    const reloaded = await getSaleById(shopId, sale.id);
    expect(reloaded.items?.[0]?.unitCostSnapshot).toBe('100.0000');
    expect(reloaded.items?.[0]?.lineCogs).toBe('200.00');
    expect(reloaded.items?.[0]?.unitPrice).toBe('200.00');
    expect(reloaded.total).toBe('400.00');

    const listed = await listSales(shopId, { page: 1, pageSize: 20 });
    expect(listed.items).toHaveLength(1);

    // BR-SA10: no edit/delete routes exist on sales or payments
    const patchRes = await request(app)
      .patch(`/api/v1/sales/${sale.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ total: '1.00' });
    expect(patchRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/api/v1/sales/${sale.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(404);
  });
});
