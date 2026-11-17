import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase6b() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase6b.test' } },
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
      email: `${prefix}@phase6b.test`,
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

describe('Phase 6b — Dashboard & Reports API endpoints', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase6b();
  });

  afterAll(async () => {
    await cleanupPhase6b();
  });

  it('BR-RP12: GET /dashboard and GET /reports/* return exact fixture values and isolate shops', async () => {
    const { token: tokenA } = await registerShop('shop-a');
    const { token: tokenB } = await registerShop('shop-b');

    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Sup 1' });
    const supId = supRes.body.data.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Cust 1' });
    const custId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Charger',
        unit: 'PIECE',
        purchaseCost: '100.00',
        sellingPrice: '200.00',
        initialQuantity: '0',
        minStockLevel: '2',
      });
    const prodId = prodRes.body.data.id as string;

    // Purchase 5 @ 100 = 500, paid 300 -> payable 200
    const purRes = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', 'p6b-pur-1')
      .send({
        supplierId: supId,
        amountPaid: '300.00',
        paymentMethod: 'CASH',
        items: [{ productId: prodId, quantity: '5', unitCost: '100.00' }],
      });
    expect(purRes.status).toBe(201);

    // Sale 2 @ 200 = 400, paid 250 -> balance 150, COGS 200
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', 'p6b-sale-1')
      .send({
        customerId: custId,
        paymentMethod: 'CASH',
        amountReceived: '250.00',
        items: [{ productId: prodId, quantity: '2' }],
      });
    expect(saleRes.status).toBe(201);

    // Expense 40 today
    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: 'Tea',
        category: 'OTHER',
        amount: '40.00',
        expenseDate: new Date().toISOString(),
        paymentMethod: 'CASH',
      });
    expect(expRes.status).toBe(201);

    const dashRes = await request(app)
      .get('/api/v1/dashboard?period=today')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(dashRes.status).toBe(200);
    const d = dashRes.body.data;
    expect(d.sales).toBe('400.00');
    expect(d.expenses).toBe('40.00');
    expect(d.estimatedProfit).toBe('160.00'); // 400 - 200 - 40
    expect(d.cashReceived).toBe('250.00');
    expect(d.cashPaidToSuppliers).toBe('300.00');
    expect(d.productCount).toBe(1);
    expect(d.lowStockCount).toBe(0); // qty 3 > min 2
    expect(d.inventoryValue).toBe('300.00'); // 3 * 100
    expect(d.customerOutstanding).toBe('150.00');
    expect(d.supplierPayable).toBe('200.00');
    expect(d.recentSales).toHaveLength(1);
    expect(d.recentPurchases).toHaveLength(1);
    expect(d.salesChart).toHaveLength(1);

    // All /reports/* endpoints
    const [salesR, purR, expR, profitR, prodR, invR, balR, woR] = await Promise.all([
      request(app).get('/api/v1/reports/sales?period=today').set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/purchases?period=today')
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/expenses?period=today')
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/profit?period=today')
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/products?period=today')
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/inventory-valuation')
        .set('Authorization', `Bearer ${tokenA}`),
      request(app).get('/api/v1/reports/balances').set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .get('/api/v1/reports/write-offs?period=today')
        .set('Authorization', `Bearer ${tokenA}`),
    ]);

    expect(salesR.status).toBe(200);
    expect(salesR.body.data.revenue).toBe('400.00');
    expect(purR.status).toBe(200);
    expect(purR.body.data.totalPurchases).toBe('500.00');
    expect(expR.status).toBe(200);
    expect(expR.body.data.totalExpenses).toBe('40.00');
    expect(profitR.status).toBe(200);
    expect(profitR.body.data.netOperatingProfit).toBe('160.00');
    expect(prodR.status).toBe(200);
    expect(prodR.body.data.bestSelling[0].netQuantitySold).toBe('2.000');
    expect(invR.status).toBe(200);
    expect(invR.body.data.totalValue).toBe('300.00');
    expect(balR.status).toBe(200);
    expect(balR.body.data.totalCustomerOutstanding).toBe('150.00');
    expect(woR.status).toBe(200);
    expect(woR.body.data.totalWriteOffValue).toBe('0.00');

    // Shop B sees zero
    const dashB = await request(app)
      .get('/api/v1/dashboard?period=today')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(dashB.status).toBe(200);
    expect(dashB.body.data.sales).toBe('0.00');
    expect(dashB.body.data.productCount).toBe(0);
  });

  it('Enforces 401 without token and 400 on invalid period/custom range query parameters', async () => {
    const { token } = await registerShop('sec');

    const unauth = await request(app).get('/api/v1/dashboard');
    expect(unauth.status).toBe(401);

    const unauthRep = await request(app).get('/api/v1/reports/sales');
    expect(unauthRep.status).toBe(401);

    const badPeriod = await request(app)
      .get('/api/v1/dashboard?period=yearly')
      .set('Authorization', `Bearer ${token}`);
    expect(badPeriod.status).toBe(400);

    const halfRange = await request(app)
      .get('/api/v1/reports/sales?from=2026-10-01')
      .set('Authorization', `Bearer ${token}`);
    expect(halfRange.status).toBe(400);

    const reversedRange = await request(app)
      .get('/api/v1/reports/sales?from=2026-10-10&to=2026-10-01')
      .set('Authorization', `Bearer ${token}`);
    expect(reversedRange.status).toBe(400);
  });
});
