import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase7b() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase7b.test' } },
    select: { shopId: true },
  });
  const shopIds = users.map((u) => u.shopId);
  if (shopIds.length === 0) return;

  await prisma.auditLog.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.payment.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.saleReturnItem.deleteMany({
    where: { saleReturn: { shopId: { in: shopIds } } },
  });
  await prisma.saleReturn.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.saleItem.deleteMany({ where: { sale: { shopId: { in: shopIds } } } });
  await prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.purchaseItem.deleteMany({ where: { purchase: { shopId: { in: shopIds } } } });
  await prisma.purchase.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.supplier.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
}

async function registerShop(prefix: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email: `${prefix}@phase7b.test`,
      password: 'Password123',
      ownerName: 'Owner',
      shopName: `${prefix} Shop`,
      shopType: 'GENERAL_RETAIL',
    });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 7b — Server sync push & pull endpoints', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase7b();
  });

  afterAll(async () => {
    await cleanupPhase7b();
  });

  it('BR-SY1, BR-SY5, BR-SY6, BR-SY7, BR-SY10, BR-SA8, BR-SA9: push applies product & sale, handles duplicate replay, negative stock warning, receipt collision, rejection & pull', async () => {
    const { token: tokenA, shopId: shopA } = await registerShop('sync-a');
    const { token: tokenB } = await registerShop('sync-b');

    const prodId = crypto.randomUUID();
    const sale1Id = crypto.randomUUID();
    const sale2Id = crypto.randomUUID();
    const badSaleId = crypto.randomUUID();
    const todayCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const collidedReceipt = `RCP-${todayCompact}-0001`;

    // 1. Push CREATE_PRODUCT (initialQuantity = 2) + CREATE_SALE (qty = 3 -> triggers NEGATIVE_STOCK)
    const push1 = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        operations: [
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_PRODUCT',
            entityId: prodId,
            idempotencyKey: prodId,
            payload: {
              name: 'Offline Cable',
              unit: 'PIECE',
              purchaseCost: '100.00',
              sellingPrice: '200.00',
              initialQuantity: '2',
              minStockLevel: '1',
            },
          },
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_SALE',
            entityId: sale1Id,
            idempotencyKey: 'sync-sale-1',
            payload: {
              paymentMethod: 'CASH',
              amountReceived: '600.00',
              receiptNo: collidedReceipt,
              declaredTotal: '600.00',
              items: [{ productId: prodId, quantity: '3' }],
            },
          },
        ],
      });

    expect(push1.status).toBe(200);
    expect(push1.body.data.results).toHaveLength(2);
    expect(push1.body.data.results[0].status).toBe('APPLIED');
    expect(push1.body.data.results[1].status).toBe('APPLIED');
    expect(push1.body.data.results[1].warnings).toContain('NEGATIVE_STOCK');

    // Verify product stock is -1 on server (BR-SY7)
    const prodRow = await prisma.product.findUnique({ where: { id: prodId } });
    expect(prodRow?.quantityOnHand.toString()).toBe('-1');

    // 2. Replay exact same push -> DUPLICATE, no duplicate records (BR-SY5, BR-SA8)
    const replay = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        operations: [
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_PRODUCT',
            entityId: prodId,
            idempotencyKey: prodId,
            payload: {
              name: 'Offline Cable',
              unit: 'PIECE',
              purchaseCost: '100.00',
              sellingPrice: '200.00',
              initialQuantity: '2',
              minStockLevel: '1',
            },
          },
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_SALE',
            entityId: sale1Id,
            idempotencyKey: 'sync-sale-1',
            payload: {
              paymentMethod: 'CASH',
              amountReceived: '600.00',
              receiptNo: collidedReceipt,
              declaredTotal: '600.00',
              items: [{ productId: prodId, quantity: '3' }],
            },
          },
        ],
      });
    expect(replay.status).toBe(200);
    expect(replay.body.data.results.map((r: { status: string }) => r.status)).toEqual([
      'DUPLICATE',
      'DUPLICATE',
    ]);
    const saleCount = await prisma.sale.count({ where: { shopId: shopA } });
    expect(saleCount).toBe(1);

    // 3. Receipt number collision (BR-SA9) + Rejected invalid sale (BR-SY6)
    const push2 = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        operations: [
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_SALE',
            entityId: sale2Id,
            idempotencyKey: 'sync-sale-2',
            payload: {
              paymentMethod: 'CASH',
              amountReceived: '200.00',
              receiptNo: collidedReceipt,
              declaredTotal: '200.00',
              items: [{ productId: prodId, quantity: '1' }],
            },
          },
          {
            id: crypto.randomUUID(),
            operationType: 'CREATE_SALE',
            entityId: badSaleId,
            idempotencyKey: 'sync-sale-bad',
            payload: {
              paymentMethod: 'CASH',
              amountReceived: '0.00',
              items: [{ productId: prodId, quantity: '1' }],
            },
          },
        ],
      });

    expect(push2.status).toBe(200);
    expect(push2.body.data.results[0].status).toBe('APPLIED');
    expect(push2.body.data.results[0].warnings).toContain('RECEIPT_RENUMBERED');
    expect(push2.body.data.results[1].status).toBe('REJECTED');
    expect(push2.body.data.results[1].error).toBeTruthy();

    // 4. Sync pull returns shop A data and isolates shop B
    const pullA = await request(app)
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(pullA.status).toBe(200);
    expect(pullA.body.data.products).toHaveLength(1);
    expect(pullA.body.data.sales).toHaveLength(2);

    const pullB = await request(app)
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(pullB.status).toBe(200);
    expect(pullB.body.data.products).toHaveLength(0);
    expect(pullB.body.data.sales).toHaveLength(0);
  });

  it('Enforces 401 without token and 400 on invalid sync payload', async () => {
    const { token } = await registerShop('sync-sec');

    const unauthPush = await request(app).post('/api/v1/sync/push').send({ operations: [] });
    expect(unauthPush.status).toBe(401);

    const unauthPull = await request(app).get('/api/v1/sync/pull');
    expect(unauthPull.status).toBe(401);

    const badPush = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ operations: [{ id: 'not-a-uuid' }] });
    expect(badPush.status).toBe(400);

    const badPull = await request(app)
      .get('/api/v1/sync/pull?since=not-a-date')
      .set('Authorization', `Bearer ${token}`);
    expect(badPull.status).toBe(400);
  });
});
