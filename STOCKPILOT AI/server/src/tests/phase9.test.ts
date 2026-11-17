import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { seedDemoShop } from '../services/seedService.js';
import { listProducts } from '../services/productService.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase9() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase9.test' } },
    select: { shopId: true },
  });
  const shopIds = users.map((u) => u.shopId);
  if (shopIds.length === 0) return;

  await prisma.aIActionLog.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.aIMessage.deleteMany({
    where: { conversation: { shopId: { in: shopIds } } },
  });
  await prisma.aIAssistantConversation.deleteMany({ where: { shopId: { in: shopIds } } });
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
      email: `${prefix}@phase9.test`,
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

describe('Phase 9 — Shop isolation sweep, seed verification & performance', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase9();
  });

  afterAll(async () => {
    await cleanupPhase9();
  });

  it('enforces auth (401) and cross-shop isolation (404 / empty scope) across every mounted route group', async () => {
    const shopA = await registerShop('iso-a');
    const shopB = await registerShop('iso-b');

    // Create records in Shop A
    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Iso Cat' });
    expect(catRes.status).toBe(201);
    const catId = catRes.body.data.id as string;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        name: 'Iso Product',
        sku: 'ISO-001',
        categoryId: catId,
        unit: 'PIECE',
        sellingPrice: '100.00',
        purchaseCost: '50.00',
        initialQuantity: '10',
      });
    expect(prodRes.status).toBe(201);
    const prodId = prodRes.body.data.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Iso Customer', phone: '03001112233' });
    expect(custRes.status).toBe(201);
    const custId = custRes.body.data.id as string;

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Iso Supplier', phone: '03004445566' });
    expect(supRes.status).toBe(201);
    const supId = supRes.body.data.id as string;

    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${shopA.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierId: supId,
        paymentMethod: 'CASH',
        amountPaid: '50.00',
        items: [{ productId: prodId, quantity: '1', unitCost: '50.00' }],
      });
    expect(purRes.status).toBe(201);
    const purId = purRes.body.data.id as string;

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${shopA.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: custId,
        paymentMethod: 'CASH',
        amountReceived: '100.00',
        items: [{ productId: prodId, quantity: '1' }],
      });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.id as string;

    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        title: 'Iso Rent',
        category: 'RENT',
        amount: '250.00',
        expenseDate: new Date().toISOString(),
        paymentMethod: 'CASH',
      });
    expect(expRes.status).toBe(201);
    const expId = expRes.body.data.id as string;

    // 1. Unauthenticated access -> 401 across all protected route groups
    const protectedEndpoints = [
      ['get', '/api/v1/shop'],
      ['get', '/api/v1/categories'],
      ['get', '/api/v1/products'],
      ['get', '/api/v1/stock-movements'],
      ['get', '/api/v1/customers'],
      ['get', '/api/v1/suppliers'],
      ['get', '/api/v1/purchases'],
      ['get', '/api/v1/sales'],
      ['get', '/api/v1/expenses'],
      ['get', '/api/v1/dashboard/summary'],
      ['get', '/api/v1/reports/sales'],
      ['get', '/api/v1/sync/pull'],
      ['get', '/api/v1/ai/conversations'],
    ] as const;

    for (const [method, path] of protectedEndpoints) {
      const r = await request(app)[method](path);
      expect(r.status).toBe(401);
    }

    // 2. Shop B cannot read or mutate Shop A's records -> 404
    const patchCatRes = await request(app)
      .patch(`/api/v1/categories/${catId}`)
      .set('Authorization', `Bearer ${shopB.token}`)
      .send({ name: 'Hacked' });
    expect(patchCatRes.status).toBe(404);

    const crossShop404 = [
      ['get', `/api/v1/products/${prodId}`],
      ['get', `/api/v1/customers/${custId}`],
      ['get', `/api/v1/suppliers/${supId}`],
      ['get', `/api/v1/purchases/${purId}`],
      ['get', `/api/v1/sales/${saleId}`],
      ['delete', `/api/v1/expenses/${expId}`],
    ] as const;

    for (const [method, path] of crossShop404) {
      const req = request(app)[method](path);
      const r = await req.set('Authorization', `Bearer ${shopB.token}`);
      expect(r.status).toBe(404);
    }

    // 3. Shop B list endpoints never include Shop A data
    const prodListB = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${shopB.token}`);
    expect(prodListB.status).toBe(200);
    expect(prodListB.body.data).toHaveLength(0);

    const movListB = await request(app)
      .get('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${shopB.token}`);
    expect(movListB.status).toBe(200);
    expect(movListB.body.data).toHaveLength(0);
  });

  it('seeds Al-Madina demo shop idempotently and satisfies BR-S4 stock movement reconciliation', async () => {
    const email = 'seed-test@phase9.test';
    const first = await seedDemoShop(prisma, email);
    expect(first.seeded).toBe(true);

    const categories = await prisma.category.count({ where: { shopId: first.shopId } });
    const products = await prisma.product.findMany({ where: { shopId: first.shopId } });
    const suppliers = await prisma.supplier.count({ where: { shopId: first.shopId } });
    const customers = await prisma.customer.count({ where: { shopId: first.shopId } });
    const purchases = await prisma.purchase.count({ where: { shopId: first.shopId } });
    const sales = await prisma.sale.count({ where: { shopId: first.shopId } });
    const expenses = await prisma.expense.count({ where: { shopId: first.shopId } });

    expect(categories).toBe(5);
    expect(products).toHaveLength(24);
    expect(suppliers).toBe(4);
    expect(customers).toBe(6);
    expect(purchases).toBe(10);
    expect(sales).toBe(60);
    expect(expenses).toBe(25);

    // BR-S4: sum(StockMovement.quantityChange) === product.quantityOnHand for all 24 products
    const groupedMovements = await prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { shopId: first.shopId },
      _sum: { quantityChange: true },
    });
    const sumMap = new Map(
      groupedMovements.map((g) => [g.productId, Number(g._sum.quantityChange ?? 0)]),
    );

    for (const p of products) {
      expect(sumMap.get(p.id)).toBe(Number(p.quantityOnHand));
    }

    // Second run must be idempotent
    const second = await seedDemoShop(prisma, email);
    expect(second.seeded).toBe(false);
    expect(second.shopId).toBe(first.shopId);
  }, 420000);

  it('queries paginated product list cleanly under 5 seconds with 2,000 products', async () => {
    const shop = await registerShop('perf');
    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${shop.token}`)
      .send({ name: 'Perf Cat' });
    const catId = catRes.body.data.id as string;

    const batch = Array.from({ length: 2000 }, (_, i) => ({
      shopId: shop.shopId,
      categoryId: catId,
      name: `Perf Product ${String(i).padStart(4, '0')}`,
      sku: `PERF-${String(i).padStart(4, '0')}`,
      unit: 'PIECE' as const,
      sellingPrice: '100.00',
      purchaseCost: '60.00',
      lastPurchaseCost: '60.00',
      averageCost: '60.00',
      quantityOnHand: 10,
      minStockLevel: 2,
    }));
    await prisma.product.createMany({ data: batch });

    const start = Date.now();
    const page = await listProducts(shop.shopId, {
      page: 1,
      pageSize: 20,
      includeArchived: false,
      lowStockOnly: false,
    });
    const elapsedMs = Date.now() - start;

    expect(page.meta.total).toBe(2000);
    expect(page.items).toHaveLength(20);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
