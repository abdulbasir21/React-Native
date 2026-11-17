import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase5b() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase5b.test' } },
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
    await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
}

async function setupShop(prefix: string) {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${prefix} Owner`,
    shopName: `${prefix} Shop`,
    email: `${prefix}@phase5b.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 5b — Returns, cancellations & customer receive-payment endpoints', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase5b();
  });

  afterAll(async () => {
    await cleanupPhase5b();
  });

  it('POST /sales/:id/returns, POST /sales/:id/cancel, POST /customers/:id/receive-payment, GET /customers/:id/sales & /payments', async () => {
    const { token } = await setupShop('p5b-flow');

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Power Bank 10k',
        unit: 'PIECE',
        purchaseCost: '1000.00',
        sellingPrice: '2000.00',
        initialQuantity: '20',
      });
    const productId = prodRes.body.data.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nadeem Traders', phone: '03007778899' });
    const customerId = custRes.body.data.id as string;

    // Sale 1: 2 units paid 4000 -> return 1 unit -> 2000 refund
    const sale1Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        paymentMethod: 'CASH',
        amountReceived: '4000.00',
        items: [{ productId, quantity: '2' }],
      });
    expect(sale1Res.status).toBe(201);
    const sale1Id = sale1Res.body.data.id as string;
    const sale1ItemId = sale1Res.body.data.items[0].id as string;

    const retRes = await request(app)
      .post(`/api/v1/sales/${sale1Id}/returns`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Defective port',
        refundMethod: 'CASH',
        items: [{ saleItemId: sale1ItemId, quantity: '1' }],
      });
    expect(retRes.status).toBe(201);
    expect(retRes.body.data.returnedValue).toBe('2000.00');
    expect(retRes.body.data.refundPaymentAmount).toBe('2000.00');
    expect(retRes.body.data.sale.netTotal).toBe('2000.00');

    // Sale 2: credit 2000; Sale 3: paid 2000 then cancelled
    const sale2Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        paymentMethod: 'CREDIT',
        amountReceived: '0.00',
        items: [{ productId, quantity: '1' }],
      });
    expect(sale2Res.status).toBe(201);

    const sale3Res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        paymentMethod: 'CASH',
        amountReceived: '2000.00',
        items: [{ productId, quantity: '1' }],
      });
    const sale3Id = sale3Res.body.data.id as string;

    const cancelRes = await request(app)
      .post(`/api/v1/sales/${sale3Id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong item billed', refundMethod: 'CASH' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.paymentStatus).toBe('NOT_APPLICABLE');

    // Customer receive-payment allocates against Sale 2 (2000)
    const payRes = await request(app)
      .post(`/api/v1/customers/${customerId}/receive-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1500.00', method: 'EASYPAISA', note: 'Installment 1' });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.outstandingBefore).toBe('2000.00');
    expect(payRes.body.data.outstandingAfter).toBe('500.00');

    const custSalesRes = await request(app)
      .get(`/api/v1/customers/${customerId}/sales`)
      .set('Authorization', `Bearer ${token}`);
    expect(custSalesRes.status).toBe(200);
    expect(custSalesRes.body.data).toHaveLength(3);

    const custPaymentsRes = await request(app)
      .get(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${token}`);
    expect(custPaymentsRes.status).toBe(200);
    expect(custPaymentsRes.body.data.length).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it('Security & validation sweep (401, other shop 404, 400 invalid input)', async () => {
    const [shopA, shopB] = await Promise.all([setupShop('p5b-sec-a'), setupShop('p5b-sec-b')]);

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        name: 'Adapter',
        unit: 'PIECE',
        purchaseCost: '200.00',
        sellingPrice: '400.00',
        initialQuantity: '5',
      });
    const productId = prodRes.body.data.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Cust A' });
    const customerId = custRes.body.data.id as string;

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${shopA.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        paymentMethod: 'CREDIT',
        amountReceived: '0.00',
        items: [{ productId, quantity: '1' }],
      });
    const saleId = saleRes.body.data.id as string;
    const saleItemId = saleRes.body.data.items[0].id as string;

    // 401 unauthenticated
    expect((await request(app).post(`/api/v1/sales/${saleId}/returns`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/sales/${saleId}/cancel`).send({})).status).toBe(401);
    expect(
      (await request(app).post(`/api/v1/customers/${customerId}/receive-payment`).send({})).status,
    ).toBe(401);
    expect((await request(app).get(`/api/v1/customers/${customerId}/sales`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/customers/${customerId}/payments`)).status).toBe(401);

    // 404 cross-shop isolation
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/returns`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ reason: 'Steal', items: [{ saleItemId, quantity: '1' }] })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/cancel`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ reason: 'Steal' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/customers/${customerId}/receive-payment`)
          .set('Authorization', `Bearer ${shopB.token}`)
          .send({ amount: '100', method: 'CASH' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/customers/${customerId}/sales`)
          .set('Authorization', `Bearer ${shopB.token}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/customers/${customerId}/payments`)
          .set('Authorization', `Bearer ${shopB.token}`)
      ).status,
    ).toBe(404);

    // 400 invalid input
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/returns`)
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ reason: '', items: [] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/sales/${saleId}/cancel`)
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ reason: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/customers/${customerId}/receive-payment`)
          .set('Authorization', `Bearer ${shopA.token}`)
          .send({ amount: '-5', method: 'CREDIT' })
      ).status,
    ).toBe(400);
  }, 120_000);
});
