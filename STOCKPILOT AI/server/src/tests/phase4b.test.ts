import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase4b() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase4b.test' } },
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

async function setupShop(prefix: string, shopName = 'Phase 4b Shop') {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${prefix} Owner`,
    shopName,
    email: `${prefix}@phase4b.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 4b — Sale endpoints, BR-SA6 override, receipt, BR-PAY3 & security', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase4b();
  });

  afterAll(async () => {
    await cleanupPhase4b();
  });

  it('POST /sales (201/200 idempotency, BR-SA6 client total ignored), GET /sales, GET /sales/:id, GET /sales/:id/receipt & POST /sales/:id/payments (BR-PAY3)', async () => {
    const { token, shopId } = await setupShop('p4b-flow');

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'USB-C Braided Cable',
        unit: 'PIECE',
        purchaseCost: '250.00',
        sellingPrice: '500.00',
        initialQuantity: '12',
      });
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Usman Telecom', phone: '03005551234' });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.id as string;

    const idempotencyKey = randomUUID();
    const salePayload = {
      id: randomUUID(),
      customerId,
      subtotal: '99999.00', // BR-SA6: must be ignored and recomputed on server
      discountAmount: '0.00',
      total: '1.00', // BR-SA6: must be replaced with server total (3 * 500 = 1500 - 150 = 1350.00)
      discount: { type: 'PERCENT', value: '10' },
      paymentMethod: 'CASH',
      amountReceived: '500.00',
      items: [{ productId, quantity: '3' }],
    };

    const createRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(salePayload);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.subtotal).toBe('1500.00');
    expect(createRes.body.data.discountAmount).toBe('150.00');
    expect(createRes.body.data.total).toBe('1350.00');
    expect(createRes.body.data.amountPaid).toBe('500.00');
    expect(createRes.body.data.balanceDue).toBe('850.00');
    expect(createRes.body.data.paymentStatus).toBe('PARTIAL');
    expect(createRes.body.data.receiptNo).toMatch(/^RCP-\d{8}-0001$/);
    const saleId = createRes.body.data.id as string;

    // Duplicate idempotency key returns 200 with same sale and stock unchanged
    const replayRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(salePayload);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.id).toBe(saleId);

    // Stock decreased by 3 once (12 -> 9)
    const prodAfter = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(prodAfter.status).toBe(200);
    expect(prodAfter.body.data.quantityOnHand).toBe('9');

    // Customer list reports derived outstandingBalance = 850.00
    const custList = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(custList.status).toBe(200);
    const foundCust = custList.body.data.find((c: { id: string }) => c.id === customerId);
    expect(foundCust?.outstandingBalance).toBe('850.00');

    // GET /sales filters & GET /sales/:id
    const listRes = await request(app)
      .get('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .query({ paymentStatus: 'PARTIAL', customerId, period: 'today' });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(saleId);

    const detailRes = await request(app)
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.items).toHaveLength(1);
    expect(detailRes.body.data.payments).toHaveLength(1);

    // GET /sales/:id/receipt returns shop metadata + sale details
    const receiptRes = await request(app)
      .get(`/api/v1/sales/${saleId}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.data.shop.id).toBe(shopId);
    expect(receiptRes.body.data.shop.name).toBe('Phase 4b Shop');
    expect(receiptRes.body.data.sale.receiptNo).toBe(createRes.body.data.receiptNo);

    // POST /sales/:id/payments BR-PAY3: overpayment > 850.00 rejected with 422
    const overpayRes = await request(app)
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '900.00', method: 'EASYPAISA' });
    expect(overpayRes.status).toBe(422);

    // Valid partial/final payment settles balance -> PAID
    const payRes = await request(app)
      .post(`/api/v1/sales/${saleId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '850.00', method: 'EASYPAISA', note: 'Settled via Easypaisa' });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.amountPaid).toBe('1350.00');
    expect(payRes.body.data.balanceDue).toBe('0.00');
    expect(payRes.body.data.paymentStatus).toBe('PAID');
  }, 120_000);

  it('Security & validation sweep (401, other shop 404, 400 invalid input & missing Idempotency-Key)', async () => {
    const [shopA, shopB] = await Promise.all([
      setupShop('p4b-sec-a', 'Shop A'),
      setupShop('p4b-sec-b', 'Shop B'),
    ]);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        name: 'Adapter 20W',
        unit: 'PIECE',
        purchaseCost: '400.00',
        sellingPrice: '800.00',
        initialQuantity: '5',
      });
    const productId = prodRes.body.data.id as string;

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${shopA.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'CASH',
        amountReceived: '800.00',
        items: [{ productId, quantity: '1' }],
      });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.id as string;

    // 401 unauthenticated checks across all Phase 4b endpoints
    expect((await request(app).get('/api/v1/sales')).status).toBe(401);
    expect((await request(app).post('/api/v1/sales').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/sales/${saleId}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/sales/${saleId}/receipt`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/sales/${saleId}/payments`).send({})).status).toBe(401);

    // 404 cross-shop isolation checks
    expect(
      (await request(app).get(`/api/v1/sales/${saleId}`).set('Authorization', `Bearer ${shopB.token}`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/sales/${saleId}/receipt`)
          .set('Authorization', `Bearer ${shopB.token}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/payments`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ amount: '100', method: 'CASH' })
      ).status,
    ).toBe(404);

    // 400 missing Idempotency-Key, unknown field, invalid UUID, invalid query
    expect(
      (
        await request(app)
          .post('/api/v1/sales')
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ paymentMethod: 'CASH', amountReceived: '800', items: [{ productId, quantity: '1' }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/sales')
          .set('Authorization', `Bearer ${shopA.token}`)
          .set('Idempotency-Key', randomUUID())
          .send({
            paymentMethod: 'CASH',
            amountReceived: '800',
            unknownInjected: true,
            items: [{ productId, quantity: '1' }],
          })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/sales/not-a-uuid').set('Authorization', `Bearer ${shopA.token}`))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/payments`)
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ amount: '-5', method: 'CREDIT' })
      ).status,
    ).toBe(400);
  });
});
