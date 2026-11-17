import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { getAiReadCache } from '../services/aiCache.js';
import { chatWithAssistant } from '../services/aiService.js';
import { executeAiTool } from '../services/aiTools.js';
import { registerOwnerAndShop } from '../services/authService.js';
import { createProduct, listProducts } from '../services/productService.js';
import { createSale } from '../services/saleService.js';

const prisma = getPrisma();

async function cleanupPhase8a() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase8a.test' } },
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

describe('Phase 8a — AI read tools, LangGraph assistant, grounding, cache & daily limits', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase8a();
  });

  afterAll(async () => {
    await cleanupPhase8a();
  });

  it('BR-AI1, BR-AI10, BR-AI11, BR-AI13: tools isolate shops, reject unknown/invalid args, disambiguate names & clear cache on write', async () => {
    const { shop: shopA } = await registerOwnerAndShop({
      email: 'a@phase8a.test',
      password: 'Password123',
      ownerName: 'Owner A',
      shopName: 'Shop A',
      shopType: 'GENERAL_RETAIL',
    });
    const { shop: shopB } = await registerOwnerAndShop({
      email: 'b@phase8a.test',
      password: 'Password123',
      ownerName: 'Owner B',
      shopName: 'Shop B',
      shopType: 'GENERAL_RETAIL',
    });

    await createProduct(shopA.id, {
      name: 'Fast Charger 20W',
      unit: 'PIECE',
      purchaseCost: '500.00',
      sellingPrice: '900.00',
      initialQuantity: '10',
    });
    await createProduct(shopA.id, {
      name: 'Fast Charger 45W',
      unit: 'PIECE',
      purchaseCost: '800.00',
      sellingPrice: '1500.00',
      initialQuantity: '5',
    });
    await createProduct(shopB.id, {
      name: 'ShopB Secret Item',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '200.00',
      initialQuantity: '1',
    });

    // BR-AI1: Shop B cannot see Shop A products
    const resB = await executeAiTool({ shopId: shopB.id }, 'searchProducts', { query: 'Fast Charger' });
    expect((resB.data as { items: unknown[] }).items).toHaveLength(0);

    // BR-AI11: Unknown tool & invalid arguments rejected
    await expect(executeAiTool({ shopId: shopA.id }, 'dropTable', {})).rejects.toThrow(
      'Unknown AI tool',
    );
    await expect(executeAiTool({ shopId: shopA.id }, 'searchProducts', { query: '' })).rejects.toThrow(
      'Invalid arguments',
    );

    // BR-AI10: Ambiguous product name returns choice request
    const amb = await executeAiTool({ shopId: shopA.id }, 'getProductDetails', {
      name: 'Fast Charger',
    });
    expect((amb.data as { ambiguous: boolean; choices: unknown[] }).ambiguous).toBe(true);
    expect((amb.data as { choices: unknown[] }).choices).toHaveLength(2);

    // BR-AI13: Read cache populated and cleared after write
    await executeAiTool({ shopId: shopA.id }, 'getInventory', {});
    expect(getAiReadCache(shopA.id, 'getInventory:{}')).toBeDefined();

    await createProduct(shopA.id, {
      name: 'USB Cable',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '250.00',
      initialQuantity: '4',
    });
    expect(getAiReadCache(shopA.id, 'getInventory:{}')).toBeUndefined();
  });

  it('BR-AI7, BR-AI8, BR-AI9, BR-AI12, BR-AI14: grounds numbers in tool output, separates actuals/estimates/suggestions, logs messages, handles 503 & 429', async () => {
    const { shop } = await registerOwnerAndShop({
      email: 'ai@phase8a.test',
      password: 'Password123',
      ownerName: 'AI Owner',
      shopName: 'AI Shop',
      shopType: 'GENERAL_RETAIL',
    });

    const prod = await createProduct(shop.id, {
      name: 'Earbuds',
      unit: 'PIECE',
      purchaseCost: '1000.00',
      sellingPrice: '1500.00',
      initialQuantity: '10',
    });

    await createSale(shop.id, {
      idempotencyKey: 'p8a-sale-1',
      paymentMethod: 'CASH',
      amountReceived: '3000.00',
      items: [{ productId: prod.id, quantity: '2' }],
    });

    // 1. Mocked model calls getSalesReport then returns grounded structured response (BR-AI14, BR-AI12)
    let turnCount = 0;
    const { conversationId, answer } = await chatWithAssistant(
      shop.id,
      { message: 'What were my sales this month?' },
      {
        modelRunner: async () => {
          turnCount += 1;
          if (turnCount === 1) {
            return {
              functionCalls: [{ name: 'getSalesReport', args: { period: 'month' } }],
            };
          }
          return {
            text: JSON.stringify({
              reply: 'Your net sales revenue this month is 3000.00 PKR.',
              actualFigures: { revenue: '3000.00', cogs: '2000.00' },
              estimates: { grossProfit: '1000.00' },
              suggestions: ['Keep Earbuds stocked as it is selling well.'],
            }),
          };
        },
      },
    );

    expect(answer.toolCallsExecuted).toEqual(['getSalesReport']);
    expect(answer.actualFigures).toEqual({ revenue: '3000.00', cogs: '2000.00' });
    expect(answer.estimates).toEqual({ grossProfit: '1000.00' });
    expect(answer.suggestions).toHaveLength(1);

    const msgs = await prisma.aIMessage.findMany({ where: { conversationId } });
    expect(msgs).toHaveLength(2);

    // 2. BR-AI9: Mocked model tries to return an unsupported hallucinated number (999999.00) -> stripped!
    const hallucinated = await chatWithAssistant(
      shop.id,
      { message: 'Give me profit', conversationId },
      {
        modelRunner: async () => ({
          text: JSON.stringify({
            reply: 'Your profit is 999999.00',
            actualFigures: { profit: '999999.00' },
            estimates: {},
            suggestions: [],
          }),
        }),
      },
    );
    expect(hallucinated.answer.actualFigures).toEqual({});
    expect(hallucinated.answer.reply).toContain('could not verify');

    // 3. BR-AI8: Gemini failure -> 503 AI_UNAVAILABLE and normal routes still work
    await expect(
      chatWithAssistant(
        shop.id,
        { message: 'Hello', conversationId },
        {
          modelRunner: async () => {
            throw new AppError(503, 'AI_UNAVAILABLE', 'Gemini down');
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE' });
    const normalProducts = await listProducts(shop.id, { page: 1, pageSize: 20 });
    expect(normalProducts.items).toHaveLength(1);

    // 4. BR-AI7: Daily message limit -> 429 AI_LIMIT_REACHED
    // Fill remaining user messages up to 30
    const existingCount = await prisma.aIMessage.count({
      where: { role: 'user', conversation: { shopId: shop.id } },
    });
    for (let i = existingCount; i < 30; i += 1) {
      await prisma.aIMessage.create({
        data: { conversationId, role: 'user', content: `msg ${i}` },
      });
    }
    await expect(
      chatWithAssistant(
        shop.id,
        { message: 'One over limit', conversationId },
        { modelRunner: async () => ({ text: 'ok' }) },
      ),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AI_LIMIT_REACHED' });
  });
});
