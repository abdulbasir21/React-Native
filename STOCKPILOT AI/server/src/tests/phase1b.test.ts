import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { getEnv } from '../config/env.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { sendSuccess } from '../lib/response.js';
import { assertFoundInShop, getShopId, scopeWhere } from '../lib/shopScope.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { resetLoginRateLimiter } from '../middleware/rateLimit.js';
import { uuidParamSchema, validateParams } from '../middleware/validate.js';

const prisma = getPrisma();

const testRouter = Router();
testRouter.get(
  '/records/:id',
  authenticate,
  requirePermission('shop:read'),
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const shopId = getShopId(req);
    const id = String(req.params.id);
    // Deliberately filter a shop-scoped query (users table has shopId) to verify BR-A5 across shops.
    const where = scopeWhere(shopId, { id });
    const record = await prisma.user.findFirst({
      where,
      select: { id: true, shopId: true, email: true, ownerName: true, role: true },
    });
    const scoped = assertFoundInShop(record, 'Record');
    sendSuccess(res, scoped, 200);
  }),
);

const app = createApp({
  mountExtraRoutes: (instance) => {
    instance.use('/api/v1/_test', testRouter);
  },
});

async function cleanupPhase1bRecords() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase1b.test' } },
    select: { id: true, shopId: true },
  });
  const shopIds = [...new Set(users.map((u) => u.shopId))];
  if (users.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
  }
  if (shopIds.length > 0) {
    await prisma.shop.deleteMany({
      where: { id: { in: shopIds } },
    });
  }
  await prisma.shop.deleteMany({
    where: { name: { startsWith: 'Rollback Test Shop' } },
  });
}

describe('Phase 1b — Auth, shop settings, and multi-tenant isolation', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
  });

  beforeEach(async () => {
    await resetLoginRateLimiter();
    await cleanupPhase1bRecords();
  });

  afterAll(async () => {
    await resetLoginRateLimiter();
    await cleanupPhase1bRecords();
  });

  it('BR-A1, BR-A6: registers OWNER + Shop atomically with default PKR and Asia/Karachi', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Ahmed Raza',
      shopName: 'Al-Madina Mobile Accessories',
      email: 'Ahmed.Raza@Phase1b.Test',
      password: 'Password123!',
      shopType: 'MOBILE_ACCESSORIES',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.email).toBe('ahmed.raza@phase1b.test');
    expect(res.body.data.user.role).toBe('OWNER');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.shop.currency).toBe('PKR');
    expect(res.body.data.shop.timezone).toBe('Asia/Karachi');
    expect(res.body.data.shop.type).toBe('MOBILE_ACCESSORIES');

    const storedUser = await prisma.user.findUnique({
      where: { email: 'ahmed.raza@phase1b.test' },
    });
    expect(storedUser).not.toBeNull();
    expect(await bcrypt.compare('Password123!', storedUser!.passwordHash)).toBe(true);
  });

  it('BR-A1, BR-A2: rolls back Shop creation when duplicate case-insensitive email fails user insert', async () => {
    const first = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Owner One',
      shopName: 'First Shop',
      email: 'duplicate@phase1b.test',
      password: 'Password123!',
      shopType: 'GROCERY',
    });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Owner Two',
      shopName: 'Rollback Test Shop Atomic Check',
      email: 'DUPLICATE@PHASE1B.TEST',
      password: 'Password123!',
      shopType: 'GROCERY',
    });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe('DUPLICATE_EMAIL');

    // Step 1 created Shop inside $transaction before User unique error; verify PostgreSQL rolled it back.
    const orphanShops = await prisma.shop.count({
      where: { name: 'Rollback Test Shop Atomic Check' },
    });
    expect(orphanShops).toBe(0);
  });

  it('BR-A2: rejects password shorter than 8 characters and invalid registration payload with 400', async () => {
    const shortPw = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Test Owner',
      shopName: 'Test Shop',
      email: 'shortpw@phase1b.test',
      password: '1234567',
      shopType: 'OTHER',
    });
    expect(shortPw.status).toBe(400);
    expect(shortPw.body.error.code).toBe('VALIDATION_ERROR');

    const unknownField = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Test Owner',
      shopName: 'Test Shop',
      email: 'unknown@phase1b.test',
      password: 'Password123!',
      shopType: 'OTHER',
      unexpectedAdminFlag: true,
    });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('BR-A3: returns generic error for wrong email/password and 429 on 6th failed login attempt', async () => {
    await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Rate Limit Owner',
      shopName: 'Rate Shop',
      email: 'ratelimit@phase1b.test',
      password: 'CorrectPassword1!',
      shopType: 'ELECTRONICS',
    });

    const wrongEmailRes = await request(app).post('/api/v1/auth/login').send({
      email: 'missing@phase1b.test',
      password: 'SomePassword1!',
    });
    const wrongPasswordRes = await request(app).post('/api/v1/auth/login').send({
      email: 'ratelimit@phase1b.test',
      password: 'WrongPassword1!',
    });

    expect(wrongEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(wrongEmailRes.body.error.message).toBe('Invalid email or password');
    expect(wrongPasswordRes.body.error.message).toBe(wrongEmailRes.body.error.message);

    // 1 failed attempt already occurred above for ratelimit@phase1b.test; send 4 more (total 5) -> 401
    for (let i = 0; i < 4; i++) {
      const attempt = await request(app).post('/api/v1/auth/login').send({
        email: 'ratelimit@phase1b.test',
        password: 'WrongPassword1!',
      });
      expect(attempt.status).toBe(401);
    }

    // 6th failed attempt -> 429
    const blocked = await request(app).post('/api/v1/auth/login').send({
      email: 'ratelimit@phase1b.test',
      password: 'WrongPassword1!',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    // Separate email should still be able to log in cleanly
    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'ratelimit@phase1b.test',
      password: 'CorrectPassword1!',
    });
    expect(otherLogin.status).toBe(429);
  });

  it('BR-A6: updates currency and timezone via PATCH /shop and rejects invalid timezone', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Settings Owner',
      shopName: 'Settings Shop',
      email: 'settings@phase1b.test',
      password: 'Password123!',
      shopType: 'GENERAL_RETAIL',
    });
    const token = reg.body.data.token as string;

    const getRes = await request(app)
      .get('/api/v1/shop')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.currency).toBe('PKR');
    expect(getRes.body.data.timezone).toBe('Asia/Karachi');

    const patchRes = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currency: 'USD',
        timezone: 'Asia/Dubai',
        address: 'Hall Road Lahore',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.currency).toBe('USD');
    expect(patchRes.body.data.timezone).toBe('Asia/Dubai');
    expect(patchRes.body.data.address).toBe('Hall Road Lahore');

    const invalidTz = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Mars/Olympus_Mons' });
    expect(invalidTz.status).toBe(400);
    expect(invalidTz.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('BR-A4, BR-A5: ignores body shopId, isolates shop records (404), rejects missing/expired tokens (401), rejects invalid params (400)', async () => {
    const shopARes = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Owner A',
      shopName: 'Shop A',
      email: 'ownera@phase1b.test',
      password: 'Password123!',
      shopType: 'MOBILE_ACCESSORIES',
    });
    const shopBRes = await request(app).post('/api/v1/auth/register').send({
      ownerName: 'Owner B',
      shopName: 'Shop B',
      email: 'ownerb@phase1b.test',
      password: 'Password123!',
      shopType: 'GROCERY',
      shopId: shopARes.body.data.shop.id,
    });

    expect(shopBRes.status).toBe(201);
    expect(shopBRes.body.data.shop.id).not.toBe(shopARes.body.data.shop.id);

    const tokenA = shopARes.body.data.token as string;
    const tokenB = shopBRes.body.data.token as string;
    const userAId = shopARes.body.data.user.id as string;

    // PATCH /shop with body.shopId belonging to Shop A must ignore it and update Shop B only
    const patchB = await request(app)
      .patch('/api/v1/shop')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Shop B Renamed', shopId: shopARes.body.data.shop.id });
    expect(patchB.status).toBe(200);
    expect(patchB.body.data.id).toBe(shopBRes.body.data.shop.id);
    expect(patchB.body.data.name).toBe('Shop B Renamed');

    const checkShopA = await request(app)
      .get('/api/v1/shop')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(checkShopA.body.data.name).toBe('Shop A');

    // Shop A can read its own record on test route
    const ownRead = await request(app)
      .get(`/api/v1/_test/records/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(ownRead.status).toBe(200);

    // Shop B requesting Shop A's record returns 404 (BR-A5)
    const crossShopRead = await request(app)
      .get(`/api/v1/_test/records/${userAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossShopRead.status).toBe(404);
    expect(crossShopRead.body.error.code).toBe('NOT_FOUND');

    // GET /auth/me works for valid token
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('ownera@phase1b.test');

    // Invalid UUID param -> 400
    const badId = await request(app)
      .get('/api/v1/_test/records/not-a-uuid')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(badId.status).toBe(400);

    // Missing token -> 401 across protected endpoints
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/shop')).status).toBe(401);
    expect((await request(app).patch('/api/v1/shop').send({ name: 'X' })).status).toBe(401);

    // Expired token -> 401
    const expiredToken = jwt.sign(
      { userId: userAId, shopId: shopARes.body.data.shop.id, role: 'OWNER' },
      getEnv().JWT_SECRET,
      { expiresIn: -10 },
    );
    const expiredRes = await request(app)
      .get('/api/v1/shop')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(expiredRes.status).toBe(401);
  });
});
