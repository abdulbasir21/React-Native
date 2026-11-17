import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { allocateOldestFirst, isExpenseDateAllowed } from '../shared/calculations.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase3() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase3.test' } },
    select: { shopId: true },
  });
  const shopIds = [...new Set(users.map((u) => u.shopId))];
  if (shopIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.purchaseItem.deleteMany({
      where: { purchase: { shopId: { in: shopIds } } },
    });
    await prisma.purchase.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.supplier.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
}

async function registerShop(prefix: string, shopName: string) {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${prefix} Owner`,
    shopName,
    email: `${prefix}@phase3.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 3 — Purchases, weighted average cost, supplier payments & expenses', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase3();
  });

  afterAll(async () => {
    await cleanupPhase3();
  });

  it('Pure allocation (BR-PU6) and expense date rule (BR-E1)', () => {
    const allocs = allocateOldestFirst(
      [
        { id: 'p-1', balanceDue: '3000.00' },
        { id: 'p-2', balanceDue: '4000.00' },
      ],
      '4500.00',
    );
    expect(allocs).toEqual([
      { targetId: 'p-1', amount: '3000.00' },
      { targetId: 'p-2', amount: '1500.00' },
    ]);

    expect(() => allocateOldestFirst([{ id: 'p-1', balanceDue: '100.00' }], '100.01')).toThrow();

    // 2026-06-10 18:30Z = 2026-06-10 23:30 PKT (Asia/Karachi)
    const now = new Date('2026-06-10T18:30:00.000Z');
    const tomorrowKarachi = new Date('2026-06-11T17:00:00.000Z'); // 22:00 PKT on June 11 (allowed)
    const dayAfterTomorrowKarachi = new Date('2026-06-11T19:30:00.000Z'); // 00:30 PKT on June 12 (blocked)
    expect(isExpenseDateAllowed(tomorrowKarachi, 'Asia/Karachi', now)).toBe(true);
    expect(isExpenseDateAllowed(dayAfterTomorrowKarachi, 'Asia/Karachi', now)).toBe(false);
  });

  it('BR-PU1, BR-PU4, BR-C1, BR-C2, BR-C7, BR-S1: purchase increases stock, writes movement, updates weighted averageCost and lastPurchaseCost', async () => {
    const { token } = await registerShop('cost', 'Cost Shop');

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Metro Distributors' });
    const supplierId = supRes.body.data.id as string;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Fast Charger',
        unit: 'PIECE',
        purchaseCost: '100.00',
        sellingPrice: '150.00',
        initialQuantity: '10',
        minStockLevel: '5',
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id as string;

    // Existing stock 10 at 100 + purchase 10 at 120 -> avg 110.0000, lastPurchaseCost 120.00
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        items: [{ productId, quantity: '10', unitCost: '120.00' }],
        amountPaid: '1200.00',
        paymentMethod: 'CASH',
      });

    expect(purRes.status).toBe(201);
    expect(purRes.body.data.total).toBe('1200.00');
    expect(purRes.body.data.amountPaid).toBe('1200.00');
    expect(purRes.body.data.balanceDue).toBe('0.00');
    expect(purRes.body.data.paymentStatus).toBe('PAID');

    const updatedProd = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(updatedProd.status).toBe(200);
    expect(updatedProd.body.data.quantityOnHand).toBe('20');
    expect(updatedProd.body.data.averageCost).toBe('110.0000');
    expect(updatedProd.body.data.lastPurchaseCost).toBe('120.00');

    const movRes = await request(app)
      .get(`/api/v1/products/${productId}/movements`)
      .set('Authorization', `Bearer ${token}`);
    expect(movRes.status).toBe(200);
    expect(movRes.body.data[0].type).toBe('PURCHASE');
    expect(movRes.body.data[0].previousQty).toBe('10');
    expect(movRes.body.data[0].quantityChange).toBe('10');
    expect(movRes.body.data[0].newQty).toBe('20');
    expect(movRes.body.data[0].purchaseId).toBe(purRes.body.data.id);
  });

  it('BR-PU2, BR-PU3, BR-PU5, BR-PU6, BR-SU1, BR-P4: partial balance, supplier payment oldest-first, overpayment 422, and archived supplier blocked', async () => {
    const { token } = await registerShop('pay', 'Supplier Pay Shop');

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha Traders' });
    const supplierId = supRes.body.data.id as string;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Power Adapter',
        unit: 'PIECE',
        purchaseCost: '500',
        sellingPrice: '800',
      });
    const productId = prodRes.body.data.id as string;

    // Purchase 1 (older): total 5000, paid 2000 -> balance 3000 (PARTIAL)
    const p1 = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        occurredAt: '2026-06-01T10:00:00.000Z',
        items: [{ productId, quantity: '10', unitCost: '500' }],
        amountPaid: '2000',
        paymentMethod: 'BANK_TRANSFER',
      });
    expect(p1.status).toBe(201);
    expect(p1.body.data.balanceDue).toBe('3000.00');
    expect(p1.body.data.paymentStatus).toBe('PARTIAL');

    // Overpayment on creation -> 422
    const overCreate = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        items: [{ productId, quantity: '2', unitCost: '500' }],
        amountPaid: '1500',
        paymentMethod: 'CASH',
      });
    expect(overCreate.status).toBe(422);

    // Purchase 2 (newer): total 4000, paid 0 -> balance 4000 (UNPAID)
    const p2 = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        occurredAt: '2026-06-05T10:00:00.000Z',
        items: [{ productId, quantity: '8', unitCost: '500' }],
      });
    expect(p2.status).toBe(201);
    expect(p2.body.data.balanceDue).toBe('4000.00');
    expect(p2.body.data.paymentStatus).toBe('UNPAID');

    const supDetailBefore = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(supDetailBefore.body.data.payableBalance).toBe('7000.00');

    // Pay 4500 oldest first -> 3000 on p1 (PAID) + 1500 on p2 (PARTIAL, 2500 left)
    const payRes = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '4500.00', method: 'EASYPAISA', note: 'Bank clear' });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.payableBalanceAfter).toBe('2500.00');
    expect(payRes.body.data.allocations).toEqual([
      { targetId: p1.body.data.id, amount: '3000.00' },
      { targetId: p2.body.data.id, amount: '1500.00' },
    ]);

    const p1After = await request(app)
      .get(`/api/v1/purchases/${p1.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(p1After.body.data.paymentStatus).toBe('PAID');
    expect(p1After.body.data.balanceDue).toBe('0.00');

    const p2After = await request(app)
      .get(`/api/v1/purchases/${p2.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(p2After.body.data.paymentStatus).toBe('PARTIAL');
    expect(p2After.body.data.balanceDue).toBe('2500.00');

    // Overpayment over balance -> 422 PAYMENT_EXCEEDS_BALANCE
    const overPay = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '2600.00', method: 'CASH' });
    expect(overPay.status).toBe(422);
    expect(overPay.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');

    // Payment history lists supplier payments
    const histRes = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${token}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.data).toHaveLength(3);

    // Archive supplier -> blocked for new purchase, history and balance visible
    await request(app)
      .post(`/api/v1/suppliers/${supplierId}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const archivedPur = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        items: [{ productId, quantity: '1', unitCost: '500' }],
      });
    expect(archivedPur.status).toBe(409);

    const archivedSupCheck = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archivedSupCheck.body.data.payableBalance).toBe('2500.00');
  });

  it('BR-PU8, BR-PU4, BR-PU7, BR-PAY5: idempotency replay returns 200 without duplicating stock, rollback on failure, and immutability (no purchase/payment edit/delete)', async () => {
    const { token } = await registerShop('idem', 'Idem Shop');
    const sup = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Idem Supplier' });
    const supplierId = sup.body.data.id as string;

    const p1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Screen Protector', unit: 'PIECE', purchaseCost: '50', sellingPrice: '150' });
    const p2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Phone Case', unit: 'PIECE', purchaseCost: '100', sellingPrice: '250' });
    const p1Id = p1.body.data.id as string;
    const p2Id = p2.body.data.id as string;

    const idemKey = randomUUID();
    const payload = {
      supplierId,
      items: [{ productId: p1Id, quantity: '5', unitCost: '60' }],
      amountPaid: '150',
      paymentMethod: 'CASH',
    };

    const first = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(payload);
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const p1AfterIdem = await request(app)
      .get(`/api/v1/products/${p1Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(p1AfterIdem.body.data.quantityOnHand).toBe('5');

    // Force failure on 2nd line (duplicate item id) -> whole purchase tx rolls back
    const sharedItemId = randomUUID();
    const failPur = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId,
        amountPaid: '100',
        paymentMethod: 'CASH',
        items: [
          { id: sharedItemId, productId: p1Id, quantity: '4', unitCost: '80' },
          { id: sharedItemId, productId: p2Id, quantity: '2', unitCost: '100' },
        ],
      });
    expect(failPur.status).toBeGreaterThanOrEqual(400);

    const p1AfterFail = await request(app)
      .get(`/api/v1/products/${p1Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(p1AfterFail.body.data.quantityOnHand).toBe('5');

    const supList = await request(app)
      .get('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`);
    expect(supList.body.data).toHaveLength(1);

    // No PATCH or DELETE routes for purchases or payments
    const patchPur = await request(app)
      .patch(`/api/v1/purchases/${first.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Hack' });
    expect(patchPur.status).toBe(404);

    const delPur = await request(app)
      .delete(`/api/v1/purchases/${first.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delPur.status).toBe(404);

    const delPay = await request(app)
      .delete(`/api/v1/payments/${first.body.data.payments[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delPay.status).toBe(404);
  });

  it('BR-E1, BR-E2, BR-E3, BR-E4: expense creation, validation, shop-local day matching, audit on edit, and no delete route', async () => {
    const { token, shopId } = await registerShop('exp', 'Expense Shop');

    // Amount 0 -> 400
    const zeroAmt = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Zero Rent',
        category: 'RENT',
        amount: '0',
        expenseDate: new Date().toISOString(),
        paymentMethod: 'CASH',
      });
    expect(zeroAmt.status).toBe(400);

    // CREDIT method -> 400
    const creditExp = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Credit Rent',
        category: 'RENT',
        amount: '5000',
        expenseDate: new Date().toISOString(),
        paymentMethod: 'CREDIT',
      });
    expect(creditExp.status).toBe(400);

    // 3 days in future -> 400
    const tooFuture = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const futureExp = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Future Bill',
        category: 'ELECTRICITY',
        amount: '1000',
        expenseDate: tooFuture,
        paymentMethod: 'CASH',
      });
    expect(futureExp.status).toBe(400);

    // Late evening UTC vs Asia/Karachi (+05:00):
    // 2026-06-10T20:30:00.000Z is 2026-06-11 01:30 in Asia/Karachi!
    const lateEveningExp = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Night Generator Fuel',
        category: 'OTHER',
        amount: '1500.00',
        expenseDate: '2026-06-10T20:30:00.000Z',
        paymentMethod: 'CASH',
        description: 'Diesel refill',
      });
    expect(lateEveningExp.status).toBe(201);

    // Should NOT appear in 2026-06-10 Asia/Karachi day range
    const june10List = await request(app)
      .get('/api/v1/expenses?from=2026-06-10&to=2026-06-10')
      .set('Authorization', `Bearer ${token}`);
    expect(june10List.body.data).toHaveLength(0);

    // Should appear in 2026-06-11 Asia/Karachi day range with meta.totalAmount
    const june11List = await request(app)
      .get('/api/v1/expenses?from=2026-06-11&to=2026-06-11')
      .set('Authorization', `Bearer ${token}`);
    expect(june11List.body.data).toHaveLength(1);
    expect(june11List.body.meta.totalAmount).toBe('1500.00');

    // Edit expense -> writes AuditLog before/after (BR-E2)
    const expId = lateEveningExp.body.data.id as string;
    const patchRes = await request(app)
      .patch(`/api/v1/expenses/${expId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1750.00', reason: 'Updated receipt total' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.amount).toBe('1750.00');

    const logs = await prisma.auditLog.findMany({
      where: { shopId, entityType: 'EXPENSE', entityId: expId },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe('UPDATE');
    expect((logs[0]!.before as { amount: string }).amount).toBe('1500.00');
    expect((logs[0]!.after as { amount: string }).amount).toBe('1750.00');

    // No delete expense route (BR-E3)
    const delExp = await request(app)
      .delete(`/api/v1/expenses/${expId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delExp.status).toBe(404);
  });

  it('Security sweep (BR-A4, BR-A5): every Phase 3 route enforces 401 without token, 404 on other shop record, and 400 on invalid input', async () => {
    const shopA = await registerShop('sec3a', 'Sec 3 A');
    const shopB = await registerShop('sec3b', 'Sec 3 B');

    const supA = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Sup A' });
    const prodA = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Prod A', unit: 'PIECE', purchaseCost: '100', sellingPrice: '150' });
    const purA = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${shopA.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId: supA.body.data.id,
        items: [{ productId: prodA.body.data.id, quantity: '5', unitCost: '100' }],
      });
    const expA = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        title: 'Rent',
        category: 'RENT',
        amount: '1000',
        expenseDate: new Date().toISOString(),
        paymentMethod: 'CASH',
      });

    const supId = supA.body.data.id as string;
    const purId = purA.body.data.id as string;
    const expId = expA.body.data.id as string;

    // 401 unauthenticated checks
    expect((await request(app).get('/api/v1/purchases')).status).toBe(401);
    expect((await request(app).post('/api/v1/purchases').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/purchases/${purId}`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/purchases/${purId}/payments`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/${supId}/pay`).send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/suppliers/${supId}/payments`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/suppliers/${supId}/purchases`)).status).toBe(401);
    expect((await request(app).get('/api/v1/expenses')).status).toBe(401);
    expect((await request(app).post('/api/v1/expenses').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/expenses/${expId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/v1/expenses/${expId}`).send({ title: 'X' })).status).toBe(401);

    // 404 cross-shop isolation checks
    expect(
      (await request(app).get(`/api/v1/purchases/${purId}`).set('Authorization', `Bearer ${shopB.token}`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/purchases/${purId}/payments`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ amount: '100', method: 'CASH' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/suppliers/${supId}/pay`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ amount: '100', method: 'CASH' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/suppliers/${supId}/payments`)
          .set('Authorization', `Bearer ${shopB.token}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/suppliers/${supId}/purchases`)
          .set('Authorization', `Bearer ${shopB.token}`)
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/expenses/${expId}`).set('Authorization', `Bearer ${shopB.token}`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/v1/expenses/${expId}`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ title: 'Stolen' })
      ).status,
    ).toBe(404);

    // 400 invalid input checks
    expect(
      (
        await request(app)
          .get('/api/v1/purchases/not-a-uuid')
          .set('Authorization', `Bearer ${shopA.token}`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/purchases')
          .set('Authorization', `Bearer ${shopA.token}`)
          .set('Idempotency-Key', randomUUID())
          .send({ supplierId: supId, items: [], extraUnknown: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/expenses')
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ title: '', category: 'RENT', amount: '-5', expenseDate: 'bad', paymentMethod: 'CASH' })
      ).status,
    ).toBe(400);
  });
});
