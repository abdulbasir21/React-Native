import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { cancelSale } from '../services/cancelService.js';
import {
  createCustomer,
  getCustomerById,
  receiveCustomerPayment,
} from '../services/customerService.js';
import { createProduct, getProductById } from '../services/productService.js';
import { createPurchase } from '../services/purchaseService.js';
import { createSaleReturn } from '../services/returnService.js';
import { addSalePayment, createSale, getSaleById } from '../services/saleService.js';
import { createSupplier } from '../services/supplierService.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase5a() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase5a.test' } },
    select: { shopId: true },
  });
  const shopIds = [...new Set(users.map((u) => u.shopId))];
  if (shopIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.saleReturnItem.deleteMany({
      where: { saleReturn: { shopId: { in: shopIds } } },
    });
    await prisma.saleReturn.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
    await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { shopId: { in: shopIds } } } });
    await prisma.purchase.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.supplier.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
}

async function setupShop(prefix: string) {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${prefix} Owner`,
    shopName: `${prefix} Shop`,
    email: `${prefix}@phase5a.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 5a — ReturnService, CancelService, Customer payment allocation & AuditLog', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase5a();
  });

  afterAll(async () => {
    await cleanupPhase5a();
  });

  it('BR-R1, BR-R2, BR-R4, BR-R6: partial & final returns on discounted sale, remainder rule, excess cash refund, unpaid balance drop & AuditLog', async () => {
    const { shopId } = await setupShop('p5a-ret');
    const prod = await createProduct(shopId, {
      name: 'Wireless Earbuds',
      unit: 'PIECE',
      purchaseCost: '600.00',
      sellingPrice: '1000.00',
      initialQuantity: '20',
    });
    const customer = await createCustomer(shopId, { name: 'Faisal Mobile' });

    // 3 * 1000 = 3000, Rs 100 discount -> lineNet 2900.00, paid 2500.00 (balance 400.00)
    const { sale } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '3' }],
      discount: { type: 'AMOUNT', value: '100' },
      paymentMethod: 'CASH',
      amountReceived: '2500.00',
      idempotencyKey: randomUUID(),
    });
    const saleItemId = sale.items![0]!.id;

    // Exceeding sold qty -> 422
    await expect(
      createSaleReturn(shopId, sale.id, {
        reason: 'Too many',
        items: [{ saleItemId, quantity: '4' }],
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'RETURN_EXCEEDS_SOLD' });

    // Partial return of 1 unit: round2(2900 * 1 / 3) = 966.67; netTotal becomes 1933.33 -> excess = 2500 - 1933.33 = 566.67
    const ret1 = await createSaleReturn(shopId, sale.id, {
      reason: 'One defective unit',
      refundMethod: 'CASH',
      items: [{ saleItemId, quantity: '1' }],
    });
    expect(ret1.returnedValue).toBe('966.67');
    expect(ret1.refundPaymentAmount).toBe('566.67');
    expect(ret1.sale.netTotal).toBe('1933.33');
    expect(ret1.sale.amountPaid).toBe('1933.33');
    expect(ret1.sale.balanceDue).toBe('0.00');
    expect(ret1.sale.paymentStatus).toBe('PAID');

    // Final return of remaining 2 units -> takes exact remainder 2900.00 - 966.67 = 1933.33
    const ret2 = await createSaleReturn(shopId, sale.id, {
      reason: 'Customer returned remaining two',
      refundMethod: 'EASYPAISA',
      items: [{ saleItemId, quantity: '2' }],
    });
    expect(ret2.returnedValue).toBe('1933.33');
    expect(ret2.refundPaymentAmount).toBe('1933.33');
    expect(ret2.sale.returnedValue).toBe('2900.00');
    expect(ret2.sale.netTotal).toBe('0.00');
    expect(ret2.sale.amountPaid).toBe('0.00');
    expect(ret2.sale.paymentStatus).toBe('NOT_APPLICABLE');

    const auditLogs = await prisma.auditLog.findMany({
      where: { shopId, entityType: 'SaleReturn' },
    });
    expect(auditLogs).toHaveLength(2);

    // Unpaid CREDIT sale (1000.00): returning 1 unit (400.00? actually 1000/2 = 500) drops balance without cash refund
    const { sale: creditSale } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CREDIT',
      amountReceived: '0.00',
      idempotencyKey: randomUUID(),
    });
    const creditItem = creditSale.items![0]!;
    const creditRet = await createSaleReturn(shopId, creditSale.id, {
      reason: 'Returned half',
      items: [{ saleItemId: creditItem.id, quantity: '1' }],
    });
    expect(creditRet.refundPaymentAmount).toBe('0.00');
    expect(creditRet.sale.balanceDue).toBe('1000.00');
    expect(creditRet.sale.payments).toHaveLength(0);
    expect((await getCustomerById(shopId, customer.id)).outstandingBalance).toBe('1000.00');
  }, 120_000);

  it('BR-C4, BR-R3, BR-R5, BR-R6: averageCost after return follows BR-C4, cancel paid sale refunds & restores stock, blocks cancel after return / cancel twice / pay or return after cancel', async () => {
    const { shopId } = await setupShop('p5a-cxl');
    const sup = await createSupplier(shopId, { name: 'Karachi Wholesale' });
    const prod = await createProduct(shopId, {
      name: 'Fast Adapter',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '200.00',
      initialQuantity: '10',
    });

    // Sell 4 (remaining 6 @ avg 100, unitCostSnapshot = 100)
    const { sale: saleA } = await createSale(shopId, {
      items: [{ productId: prod.id, quantity: '4' }],
      paymentMethod: 'CASH',
      amountReceived: '800.00',
      idempotencyKey: randomUUID(),
    });
    // Purchase 6 @ 150 -> (6 * 100 + 6 * 150) / 12 = 125.0000
    await createPurchase(shopId, {
      supplierId: sup.id,
      items: [{ productId: prod.id, quantity: '6', unitCost: '150.00' }],
      amountPaid: '900.00',
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
    });
    expect((await getProductById(shopId, prod.id)).averageCost).toBe('125.0000');

    // Return 2 from saleA (snapshot cost 100) -> (12 * 125 + 2 * 100) / 14 = 121.4286
    await createSaleReturn(shopId, saleA.id, {
      reason: 'BR-C4 return vector',
      refundMethod: 'CASH',
      items: [{ saleItemId: saleA.items![0]!.id, quantity: '2' }],
    });
    const afterReturnProd = await getProductById(shopId, prod.id);
    expect(afterReturnProd.quantityOnHand).toBe('14');
    expect(afterReturnProd.averageCost).toBe('121.4286');

    // Cancel after a return -> 422
    await expect(
      cancelSale(shopId, saleA.id, { reason: 'Try cancel after return', refundMethod: 'CASH' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'SALE_HAS_RETURNS' });

    // Cancel a fresh paid sale -> full refund Payment, SALE_CANCELLATION movement & AuditLog
    const { sale: saleB } = await createSale(shopId, {
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '400.00',
      idempotencyKey: randomUUID(),
    });
    const cancelled = await cancelSale(shopId, saleB.id, {
      reason: 'Customer changed mind',
      refundMethod: 'CASH',
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.amountPaid).toBe('0.00');
    expect(cancelled.balanceDue).toBe('0.00');
    expect(cancelled.paymentStatus).toBe('NOT_APPLICABLE');

    const cxlMovements = await prisma.stockMovement.findMany({
      where: { shopId, saleId: saleB.id, type: 'SALE_CANCELLATION' },
    });
    expect(cxlMovements).toHaveLength(1);
    expect(cxlMovements[0]!.quantityChange.toString()).toBe('2');

    const cxlAudit = await prisma.auditLog.findFirst({
      where: { shopId, entityType: 'Sale', entityId: saleB.id, action: 'CANCEL' },
    });
    expect(cxlAudit?.reason).toBe('Customer changed mind');

    // Cancel twice -> 409; return cancelled -> 409; pay cancelled -> 409
    await expect(
      cancelSale(shopId, saleB.id, { reason: 'Again' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SALE_ALREADY_CANCELLED' });
    await expect(
      createSaleReturn(shopId, saleB.id, {
        reason: 'Return cancelled',
        items: [{ saleItemId: saleB.items![0]!.id, quantity: '1' }],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SALE_CANCELLED' });
    await expect(
      addSalePayment(shopId, saleB.id, { amount: '100', method: 'CASH' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SALE_CANCELLED' });
  }, 120_000);

  it('BR-PAY3, BR-PAY4, BR-PAY5: customer payment allocates oldest-first across 3 sales and customer balance equals sum of balances', async () => {
    const { shopId } = await setupShop('p5a-pay');
    const prod = await createProduct(shopId, {
      name: 'Screen Guard',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '500.00',
      initialQuantity: '50',
    });
    const customer = await createCustomer(shopId, { name: 'Lahore Telecom' });

    const t0 = new Date('2026-10-01T10:00:00.000Z');
    const t1 = new Date('2026-10-02T10:00:00.000Z');
    const t2 = new Date('2026-10-03T10:00:00.000Z');

    const { sale: s1 } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '2' }], // 1000
      paymentMethod: 'CREDIT',
      occurredAt: t0,
      idempotencyKey: randomUUID(),
    });
    const { sale: s2 } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '3' }], // 1500
      paymentMethod: 'CREDIT',
      occurredAt: t1,
      idempotencyKey: randomUUID(),
    });
    const { sale: s3 } = await createSale(shopId, {
      customerId: customer.id,
      items: [{ productId: prod.id, quantity: '4' }], // 2000
      paymentMethod: 'CREDIT',
      occurredAt: t2,
      idempotencyKey: randomUUID(),
    });

    expect((await getCustomerById(shopId, customer.id)).outstandingBalance).toBe('4500.00');

    // Overpayment rejected with 422
    await expect(
      receiveCustomerPayment(shopId, customer.id, { amount: '4500.01', method: 'CASH' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'PAYMENT_EXCEEDS_BALANCE' });

    // Pay 2800 -> 1000 (s1) + 1500 (s2) + 300 (s3)
    const payRes = await receiveCustomerPayment(shopId, customer.id, {
      amount: '2800.00',
      method: 'BANK_TRANSFER',
      note: 'Bank settlement',
    });
    expect(payRes.outstandingBefore).toBe('4500.00');
    expect(payRes.outstandingAfter).toBe('1700.00');
    expect(payRes.allocations).toEqual([
      { saleId: s1.id, receiptNo: s1.receiptNo, amount: '1000.00' },
      { saleId: s2.id, receiptNo: s2.receiptNo, amount: '1500.00' },
      { saleId: s3.id, receiptNo: s3.receiptNo, amount: '300.00' },
    ]);

    expect((await getSaleById(shopId, s1.id)).paymentStatus).toBe('PAID');
    expect((await getSaleById(shopId, s2.id)).paymentStatus).toBe('PAID');
    const s3After = await getSaleById(shopId, s3.id);
    expect(s3After.paymentStatus).toBe('PARTIAL');
    expect(s3After.balanceDue).toBe('1700.00');
    expect((await getCustomerById(shopId, customer.id)).outstandingBalance).toBe('1700.00');
  }, 120_000);

  it('Rollback on forced failure during return leaves sale, stock, payments & audit log untouched', async () => {
    const { shopId } = await setupShop('p5a-rb');
    const prod = await createProduct(shopId, {
      name: 'Car Charger',
      unit: 'PIECE',
      purchaseCost: '200.00',
      sellingPrice: '400.00',
      initialQuantity: '10',
    });

    const { sale } = await createSale(shopId, {
      items: [{ productId: prod.id, quantity: '2' }],
      paymentMethod: 'CASH',
      amountReceived: '800.00',
      idempotencyKey: randomUUID(),
    });
    const existingMovement = await prisma.stockMovement.findFirst({
      where: { shopId, saleId: sale.id },
    });

    await expect(
      createSaleReturn(shopId, sale.id, {
        reason: 'Force movement PK collision',
        refundMethod: 'CASH',
        items: [{ saleItemId: sale.items![0]!.id, movementId: existingMovement!.id, quantity: '1' }],
      }),
    ).rejects.toThrow();

    expect((await getProductById(shopId, prod.id)).quantityOnHand).toBe('8');
    expect((await prisma.saleReturn.count({ where: { shopId, saleId: sale.id } }))).toBe(0);
    expect((await prisma.auditLog.count({ where: { shopId, entityType: 'SaleReturn' } }))).toBe(0);
    expect((await getSaleById(shopId, sale.id)).amountPaid).toBe('800.00');
  }, 120_000);
});
