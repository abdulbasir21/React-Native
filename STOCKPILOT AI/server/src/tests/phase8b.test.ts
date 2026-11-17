import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { executeAiTool } from '../services/aiTools.js';

const app = createApp();
const prisma = getPrisma();

async function cleanupPhase8b() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase8b.test' } },
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
      email: `${prefix}@phase8b.test`,
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

describe('Phase 8b — AI write proposals, confirmation, strong confirm, expiry & security', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase8b();
  });

  afterAll(async () => {
    await cleanupPhase8b();
  });

  it('BR-AI2..BR-AI6, BR-AI11, BR-AI12: write tools propose without mutating, confirm executes once identically to POS, enforces expiry, rejection & strong confirm', async () => {
    const { token: tokenA, shopId: shopA } = await registerShop('ai-a');
    const { token: tokenB } = await registerShop('ai-b');

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Power Bank',
        unit: 'PIECE',
        purchaseCost: '1000.00',
        sellingPrice: '2000.00',
        initialQuantity: '10',
      });
    const prodId = prodRes.body.data.id as string;

    // 1. BR-AI2: Propose recordSale -> NO sale or stock movement created yet
    const proposalRes = await executeAiTool({ shopId: shopA }, 'recordSale', {
      paymentMethod: 'CASH',
      amountReceived: '4000.00',
      items: [{ productId: prodId, quantity: '2' }],
    });
    const action1 = proposalRes.data as { id: string; status: string; requiresStrongConfirm: boolean };
    expect(action1.status).toBe('PENDING');
    expect(action1.requiresStrongConfirm).toBe(false);
    expect(await prisma.sale.count({ where: { shopId: shopA } })).toBe(0);

    // 2. BR-AI3 & BR-AI5: Confirm executes once; double confirm returns same result & one sale
    const c1 = await request(app)
      .post(`/api/v1/ai/actions/${action1.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(c1.status).toBe(200);
    expect(c1.body.data.action.status).toBe('CONFIRMED');

    const c2 = await request(app)
      .post(`/api/v1/ai/actions/${action1.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(c2.status).toBe(200);
    expect(c2.body.data.action.status).toBe('CONFIRMED');
    expect(await prisma.sale.count({ where: { shopId: shopA } })).toBe(1);

    // Compare AI-created sale rows with POS sale (Sale, SaleItem, StockMovement, Payment)
    const aiSale = await prisma.sale.findFirstOrThrow({
      where: { shopId: shopA, idempotencyKey: action1.id },
      include: { items: true, payments: true, stockMovements: true },
    });
    expect(aiSale.total.toString()).toBe('4000');
    expect(aiSale.items).toHaveLength(1);
    expect(aiSale.payments).toHaveLength(1);
    expect(aiSale.stockMovements).toHaveLength(1);

    // 3. BR-AI4: Expired action (> 10 min) cannot be confirmed
    const expiredProposal = await executeAiTool({ shopId: shopA }, 'recordExpense', {
      title: 'Tea',
      category: 'OTHER',
      amount: '100.00',
      paymentMethod: 'CASH',
    });
    const expiredId = (expiredProposal.data as { id: string }).id;
    await prisma.aIActionLog.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expConfirm = await request(app)
      .post(`/api/v1/ai/actions/${expiredId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(expConfirm.status).toBe(409);

    // 4. BR-AI6: Strong confirm required >= 50,000 AND for > 50% price change
    const highSaleProp = await executeAiTool({ shopId: shopA }, 'recordSale', {
      paymentMethod: 'CASH',
      amountReceived: '60000.00',
      items: [{ productId: prodId, quantity: '3', unitPrice: '20000.00' }],
    });
    const highAction = highSaleProp.data as {
      id: string;
      requiresStrongConfirm: boolean;
      strongConfirmTarget: string;
    };
    expect(highAction.requiresStrongConfirm).toBe(true);
    expect(highAction.strongConfirmTarget).toBe('60000.00');

    const failStrong = await request(app)
      .post(`/api/v1/ai/actions/${highAction.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ confirmInput: '1000' });
    expect(failStrong.status).toBe(400);

    const priceSpikeProp = await executeAiTool({ shopId: shopA }, 'updateProduct', {
      productId: prodId,
      sellingPrice: '4000.00', // +100% > 50%
    });
    const priceAction = priceSpikeProp.data as {
      id: string;
      requiresStrongConfirm: boolean;
      strongConfirmTarget: string;
    };
    expect(priceAction.requiresStrongConfirm).toBe(true);
    expect(priceAction.strongConfirmTarget).toBe('Power Bank');

    // 5. Reject stays rejected and cannot be confirmed
    const rejRes = await request(app)
      .post(`/api/v1/ai/actions/${priceAction.id}/reject`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.data.action.status).toBe('REJECTED');
    const confirmRejected = await request(app)
      .post(`/api/v1/ai/actions/${priceAction.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ confirmInput: 'Power Bank' });
    expect(confirmRejected.status).toBe(409);

    // 6. BR-AI11: AI cannot cancel, return or delete
    await expect(executeAiTool({ shopId: shopA }, 'cancelSale', {})).rejects.toThrow(
      'Unknown AI tool',
    );
    await expect(executeAiTool({ shopId: shopA }, 'createSaleReturn', {})).rejects.toThrow(
      'Unknown AI tool',
    );
    await expect(executeAiTool({ shopId: shopA }, 'deleteProduct', {})).rejects.toThrow(
      'Unknown AI tool',
    );

    // 7. Security: 401, other shop 404, 400
    expect((await request(app).post('/api/v1/ai/chat').send({ message: 'hi' })).status).toBe(401);
    expect((await request(app).get('/api/v1/ai/conversations')).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/v1/ai/actions/${highAction.id}/confirm`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ confirmInput: '60000.00' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/ai/chat')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ message: '' })
      ).status,
    ).toBe(400);
  });
});
