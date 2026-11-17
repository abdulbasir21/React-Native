import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase2() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase2.test' } },
    select: { id: true, shopId: true },
  });
  const shopIds = [...new Set(users.map((u) => u.shopId))];
  if (shopIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.category.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.customer.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.supplier.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.user.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }
}

async function createShopOwner(emailPrefix: string, shopName: string) {
  const res = await request(app).post('/api/v1/auth/register').send({
    ownerName: `${emailPrefix} Owner`,
    shopName,
    email: `${emailPrefix}@phase2.test`,
    password: 'Password123!',
    shopType: 'MOBILE_ACCESSORIES',
  });
  expect(res.status).toBe(201);
  return {
    token: res.body.data.token as string,
    shopId: res.body.data.shop.id as string,
  };
}

describe('Phase 2 — Core entities: categories, products, customers, suppliers, stock movements', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await cleanupPhase2();
  });

  afterAll(async () => {
    await cleanupPhase2();
  });

  it('BR-G4, BR-P1, BR-P3, BR-P6: creates product with client UUID, initial stock movement, zero-stock rule, and low-stock derivation', async () => {
    const { token } = await createShopOwner('p3', 'Al-Madina Test');
    const clientCatId = randomUUID();
    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: clientCatId, name: 'Chargers' });
    expect(catRes.status).toBe(201);
    expect(catRes.body.data.id).toBe(clientCatId);

    // Initial stock > 0 -> creates INITIAL_STOCK movement and averageCost = purchaseCost
    const clientProdId = randomUUID();
    const p1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: clientProdId,
        categoryId: clientCatId,
        name: 'Samsung 25W Charger',
        sku: 'CHG-25W',
        unit: 'PIECE',
        purchaseCost: '850.00',
        sellingPrice: '1200.00',
        initialQuantity: '10',
        minStockLevel: '10',
      });

    expect(p1Res.status).toBe(201);
    expect(p1Res.body.data.id).toBe(clientProdId);
    expect(p1Res.body.data.quantityOnHand).toBe('10');
    expect(p1Res.body.data.averageCost).toBe('850.0000');
    expect(p1Res.body.data.lastPurchaseCost).toBe('850.00');
    // BR-P6: quantityOnHand <= minStockLevel -> isLowStock = true
    expect(p1Res.body.data.isLowStock).toBe(true);

    const p1Movs = await request(app)
      .get(`/api/v1/products/${clientProdId}/movements`)
      .set('Authorization', `Bearer ${token}`);
    expect(p1Movs.status).toBe(200);
    expect(p1Movs.body.data).toHaveLength(1);
    expect(p1Movs.body.data[0].type).toBe('INITIAL_STOCK');
    expect(p1Movs.body.data[0].previousQty).toBe('0');
    expect(p1Movs.body.data[0].quantityChange).toBe('10');
    expect(p1Movs.body.data[0].newQty).toBe('10');

    // Initial stock = 0 -> averageCost = purchaseCost, no movement created
    const p2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'USB-C Cable 1m',
        unit: 'PIECE',
        purchaseCost: '200',
        sellingPrice: '400',
      });
    expect(p2Res.status).toBe(201);
    expect(p2Res.body.data.quantityOnHand).toBe('0');
    expect(p2Res.body.data.averageCost).toBe('200.0000');

    const p2Movs = await request(app)
      .get(`/api/v1/products/${p2Res.body.data.id}/movements`)
      .set('Authorization', `Bearer ${token}`);
    expect(p2Movs.status).toBe(200);
    expect(p2Movs.body.data).toHaveLength(0);
  });

  it('BR-P1, BR-P2, BR-P4, BR-P5, BR-P7: enforces SKU uniqueness (even archived), unit quantity rules, update ignores quantity/averageCost, and archives safely', async () => {
    const { token } = await createShopOwner('rules', 'Shop Rules');

    // PIECE rejects decimal initialQuantity
    const badDecimalPiece = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Adapter',
        unit: 'PIECE',
        purchaseCost: '100',
        sellingPrice: '150',
        initialQuantity: '2.5',
      });
    expect(badDecimalPiece.status).toBe(400);

    // KG accepts decimal initialQuantity up to 3 decimals
    const kgRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Basmati Rice',
        sku: 'RICE-101',
        unit: 'KG',
        purchaseCost: '320',
        sellingPrice: '380',
        initialQuantity: '12.375',
      });
    expect(kgRes.status).toBe(201);
    expect(kgRes.body.data.quantityOnHand).toBe('12.375');

    // Update ignores quantityOnHand and averageCost (BR-P2) and updates prices (BR-P7)
    const patchRes = await request(app)
      .patch(`/api/v1/products/${kgRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sellingPrice: '410',
        quantityOnHand: '999',
        averageCost: '1.00',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.sellingPrice).toBe('410.00');
    expect(patchRes.body.data.quantityOnHand).toBe('12.375');
    expect(patchRes.body.data.averageCost).toBe('320.0000');

    // Archive hides product from default list, keeps in includeArchived=true & movements visible (BR-P4)
    const archRes = await request(app)
      .post(`/api/v1/products/${kgRes.body.data.id}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archRes.status).toBe(200);
    expect(archRes.body.data.archivedAt).not.toBeNull();

    const activeList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${token}`);
    expect(activeList.body.data).toHaveLength(0);

    const allList = await request(app)
      .get('/api/v1/products?includeArchived=true')
      .set('Authorization', `Bearer ${token}`);
    expect(allList.body.data).toHaveLength(1);

    const archivedMovs = await request(app)
      .get(`/api/v1/products/${kgRes.body.data.id}/movements`)
      .set('Authorization', `Bearer ${token}`);
    expect(archivedMovs.status).toBe(200);
    expect(archivedMovs.body.data).toHaveLength(1);

    // Duplicate SKU (case-insensitive) including archived product -> 409 (BR-P1)
    const dupSku = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Another Rice',
        sku: 'rice-101',
        unit: 'KG',
        purchaseCost: '300',
        sellingPrice: '350',
      });
    expect(dupSku.status).toBe(409);
    expect(dupSku.body.error.code).toBe('DUPLICATE_SKU');
  });

  it('BR-S1, BR-S2, BR-S3, BR-S4, BR-S5, BR-S6, BR-C5: stock adjustment signs, reasons, negative guard, immutability, cost unchanged, rollback, and reconciliation', async () => {
    const { token } = await createShopOwner('stock', 'Stock Shop');
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Power Bank 10000mAh',
        unit: 'PIECE',
        purchaseCost: '2200',
        sellingPrice: '3000',
        initialQuantity: '10',
      });
    const productId = prodRes.body.data.id as string;

    // Missing reason for DAMAGED -> 400 (BR-S3)
    const noReason = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DAMAGED', quantityChange: '-2', reason: '   ' });
    expect(noReason.status).toBe(400);

    // Wrong sign for DAMAGED (positive) and zero change for ADJUSTMENT -> 400 (BR-S2)
    const wrongSign = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DAMAGED', quantityChange: '2', reason: 'Water spill' });
    expect(wrongSign.status).toBe(400);

    const zeroChange = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ADJUSTMENT', quantityChange: '0', reason: 'No change' });
    expect(zeroChange.status).toBe(400);

    // Online adjustment making stock negative -> 409 INSUFFICIENT_STOCK (BR-S6)
    const belowZero = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'EXPIRED', quantityChange: '-11', reason: 'Battery bulge' });
    expect(belowZero.status).toBe(409);
    expect(belowZero.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Valid DAMAGED movement (-2) and positive ADJUSTMENT (+5)
    const movId = randomUUID();
    const dmgRes = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: movId,
        type: 'DAMAGED',
        quantityChange: '-2',
        reason: 'Dropped during display setup',
      });
    expect(dmgRes.status).toBe(201);
    expect(dmgRes.body.data.previousQty).toBe('10');
    expect(dmgRes.body.data.newQty).toBe('8');

    const adjRes = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ADJUSTMENT',
        quantityChange: '5',
        reason: 'Found missing box on top shelf',
      });
    expect(adjRes.status).toBe(201);
    expect(adjRes.body.data.previousQty).toBe('8');
    expect(adjRes.body.data.newQty).toBe('13');

    // BR-C5: averageCost stays 2200.0000 after DAMAGED and ADJUSTMENT
    const afterProd = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(afterProd.body.data.quantityOnHand).toBe('13');
    expect(afterProd.body.data.averageCost).toBe('2200.0000');

    // Rollback test: passing duplicate movement ID causes step 2 (stockMovement.create) to fail in Postgres;
    // verify Product.quantityOnHand stays 13!
    const failAdj = await request(app)
      .post(`/api/v1/products/${productId}/adjust-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: movId,
        type: 'ADJUSTMENT',
        quantityChange: '-3',
        reason: 'Duplicate movement ID rollback check',
      });
    expect(failAdj.status).toBeGreaterThanOrEqual(400);

    const afterRollback = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(afterRollback.body.data.quantityOnHand).toBe('13');

    // BR-S4 reconciliation passes
    const recRes = await request(app)
      .get('/api/v1/stock-movements/reconcile')
      .set('Authorization', `Bearer ${token}`);
    expect(recRes.status).toBe(200);
    expect(recRes.body.data.balanced).toBe(true);
    expect(recRes.body.data.mismatches).toEqual([]);

    // BR-S5: Stock movements cannot be updated or deleted
    expect(
      (await request(app).patch(`/api/v1/stock-movements/${movId}`).set('Authorization', `Bearer ${token}`).send({ reason: 'Edit' })).status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/v1/stock-movements/${movId}`).set('Authorization', `Bearer ${token}`)).status,
    ).toBe(404);
  });

  it('BR-CU1, BR-SU1: creates, updates, filters, and archives customers and suppliers without deleting', async () => {
    const { token } = await createShopOwner('custsup', 'Relations Shop');

    const custId = randomUUID();
    const createCust = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: custId, name: 'Bilal Khan', phone: '0300-1112223' });
    expect(createCust.status).toBe(201);
    expect(createCust.body.data.id).toBe(custId);

    await request(app)
      .post(`/api/v1/customers/${custId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeCustomers = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(activeCustomers.body.data).toHaveLength(0);

    const allCustomers = await request(app)
      .get('/api/v1/customers?includeArchived=true')
      .set('Authorization', `Bearer ${token}`);
    expect(allCustomers.body.data).toHaveLength(1);

    const supId = randomUUID();
    const createSup = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: supId,
        name: 'Lahore Mobile Wholesale',
        address: 'Hall Road',
        notes: 'Fast delivery',
      });
    expect(createSup.status).toBe(201);

    await request(app)
      .post(`/api/v1/suppliers/${supId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeSuppliers = await request(app)
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`);
    expect(activeSuppliers.body.data).toHaveLength(0);

    const archivedSupplierDetail = await request(app)
      .get(`/api/v1/suppliers/${supId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archivedSupplierDetail.status).toBe(200);
    expect(archivedSupplierDetail.body.data.archivedAt).not.toBeNull();
  });

  it('Security sweep (BR-A4, BR-A5): every Phase 2 route enforces 401 without token, 404 on another shop record, and 400 on invalid input', async () => {
    const shopA = await createShopOwner('seca', 'Shop A');
    const shopB = await createShopOwner('secb', 'Shop B');

    const catA = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Cables' });
    const prodA = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({
        categoryId: catA.body.data.id,
        name: 'Type-C Cable',
        unit: 'PIECE',
        purchaseCost: '150',
        sellingPrice: '300',
        initialQuantity: '5',
      });
    const custA = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Cust A' });
    const supA = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${shopA.token}`)
      .send({ name: 'Sup A' });

    const catId = catA.body.data.id as string;
    const prodId = prodA.body.data.id as string;
    const custId = custA.body.data.id as string;
    const supId = supA.body.data.id as string;

    // 401 checks without token
    expect((await request(app).get('/api/v1/categories')).status).toBe(401);
    expect((await request(app).post('/api/v1/categories').send({ name: 'X' })).status).toBe(401);
    expect((await request(app).patch(`/api/v1/categories/${catId}`).send({ name: 'Y' })).status).toBe(401);
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
    expect((await request(app).post('/api/v1/products').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/products/${prodId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/v1/products/${prodId}`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/products/${prodId}/archive`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/products/${prodId}/adjust-stock`).send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/products/${prodId}/movements`)).status).toBe(401);
    expect((await request(app).get('/api/v1/stock-movements')).status).toBe(401);
    expect((await request(app).get('/api/v1/stock-movements/reconcile')).status).toBe(401);
    expect((await request(app).get('/api/v1/customers')).status).toBe(401);
    expect((await request(app).post('/api/v1/customers').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/customers/${custId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/v1/customers/${custId}`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/customers/${custId}/archive`)).status).toBe(401);
    expect((await request(app).get('/api/v1/suppliers')).status).toBe(401);
    expect((await request(app).post('/api/v1/suppliers').send({})).status).toBe(401);
    expect((await request(app).get(`/api/v1/suppliers/${supId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/v1/suppliers/${supId}`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/v1/suppliers/${supId}/archive`)).status).toBe(401);

    // 404 checks across Shop B -> Shop A IDs
    expect(
      (await request(app).patch(`/api/v1/categories/${catId}`).set('Authorization', `Bearer ${shopB.token}`).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/products/${prodId}`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/v1/products/${prodId}`).set('Authorization', `Bearer ${shopB.token}`).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/v1/products/${prodId}/archive`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/v1/products/${prodId}/adjust-stock`).set('Authorization', `Bearer ${shopB.token}`).send({ type: 'ADJUSTMENT', quantityChange: '1', reason: 'Hack' })).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/products/${prodId}/movements`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/customers/${custId}`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/v1/customers/${custId}`).set('Authorization', `Bearer ${shopB.token}`).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/v1/customers/${custId}/archive`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/suppliers/${supId}`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/v1/suppliers/${supId}`).set('Authorization', `Bearer ${shopB.token}`).send({ name: 'Hack' })).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/v1/suppliers/${supId}/archive`).set('Authorization', `Bearer ${shopB.token}`)).status,
    ).toBe(404);

    // 400 checks for invalid inputs / unknown fields / invalid UUIDs
    expect(
      (await request(app).post('/api/v1/categories').set('Authorization', `Bearer ${shopA.token}`).send({ name: '' })).status,
    ).toBe(400);
    expect(
      (await request(app).patch('/api/v1/categories/not-uuid').set('Authorization', `Bearer ${shopA.token}`).send({ name: 'Ok' })).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/v1/products').set('Authorization', `Bearer ${shopA.token}`).send({ name: 'Bad', unknownField: 1 })).status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/products/bad-uuid').set('Authorization', `Bearer ${shopA.token}`)).status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/v1/stock-movements?page=0').set('Authorization', `Bearer ${shopA.token}`)).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/v1/customers').set('Authorization', `Bearer ${shopA.token}`).send({ name: '' })).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${shopA.token}`).send({ name: '' })).status,
    ).toBe(400);
  });
});
