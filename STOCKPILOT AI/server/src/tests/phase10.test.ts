import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase10() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase10.test' } },
    select: { shopId: true },
  });
  const shopIds = users.map((u) => u.shopId);
  if (shopIds.length === 0) return;

  await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
  await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
}

describe('Phase 10 — Deployment readiness, security headers, rate limit & smoke flow', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase10();
  });

  afterAll(async () => {
    await cleanupPhase10();
  });

  it('serves health endpoint with Helmet security headers and enforces BR-A3 login rate limit', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-frame-options']).toBeDefined();

    // BR-A3: 5 failed login attempts -> 6th returns 429
    const email = `ratelimit-${randomUUID().slice(0, 8)}@phase10.test`;
    for (let i = 0; i < 5; i += 1) {
      const attempt = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123' });
      expect(attempt.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123' });
    expect(blocked.status).toBe(429);
  });

  it('completes end-to-end smoke flow: register -> login -> create product -> list products -> POS sale', async () => {
    const email = `smoke-${randomUUID().slice(0, 8)}@phase10.test`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        ownerName: 'Smoke Owner',
        shopName: 'Smoke Test Shop',
        email,
        password: 'Password123',
        shopType: 'GENERAL_RETAIL',
      });
    expect(reg.status).toBe(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123' });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;

    const prod = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Smoke Test Adapter',
        unit: 'PIECE',
        purchaseCost: '500.00',
        sellingPrice: '1000.00',
        initialQuantity: '5',
      });
    expect(prod.status).toBe(201);
    const prodId = prod.body.data.id as string;

    const list = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const sale = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'CASH',
        amountReceived: '2000.00',
        items: [{ productId: prodId, quantity: '2' }],
      });
    expect(sale.status).toBe(201);
    expect(sale.body.data.total).toBe('2000.00');
  });
});
