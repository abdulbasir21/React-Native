import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensurePrismaConnected, getPrisma } from '../lib/prisma.js';
import { registerOwnerAndShop } from '../services/authService.js';
import { createCategory } from '../services/categoryService.js';
import { createCustomer } from '../services/customerService.js';
import { createExpense } from '../services/expenseService.js';
import { adjustProductStock } from '../services/inventoryService.js';
import { createProduct } from '../services/productService.js';
import { createPurchase } from '../services/purchaseService.js';
import {
  getBalancesReport,
  getDashboardSummary,
  getExpenseReport,
  getInventoryValuationReport,
  getProductPerformanceReport,
  getProfitReport,
  getPurchasesReport,
  getSalesReport,
  getWriteOffsReport,
  SLOW_MOVING_DAYS,
} from '../services/reportService.js';
import { cancelSale } from '../services/cancelService.js';
import { createSaleReturn } from '../services/returnService.js';
import { createSale } from '../services/saleService.js';
import { createSupplier } from '../services/supplierService.js';

const prisma = getPrisma();

async function cleanupPhase6a() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@phase6a.test' } },
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

describe('Phase 6a — ReportService exact calculations & boundaries', () => {
  beforeAll(async () => {
    await ensurePrismaConnected();
    await cleanupPhase6a();
  });

  afterAll(async () => {
    await cleanupPhase6a();
  });

  it('BR-RP1..BR-RP8, BR-RP11, BR-RP12, BR-P6: fixture shop matches hand-calculated exact decimal numbers', async () => {
    const { shop } = await registerOwnerAndShop({
      email: 'fixture@phase6a.test',
      password: 'Password123',
      ownerName: 'Fixture Owner',
      shopName: 'Fixture Shop',
      shopType: 'GENERAL_RETAIL',
    });

    const cat = await createCategory(shop.id, { name: 'Accessories' });
    const sup = await createSupplier(shop.id, { name: 'SupA' });
    const cust = await createCustomer(shop.id, { name: 'CustA' });

    const prodA = await createProduct(shop.id, {
      name: 'ProdA',
      categoryId: cat.id,
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '150.00',
      initialQuantity: '0',
      minStockLevel: '5',
    });
    const prodB = await createProduct(shop.id, {
      name: 'ProdB',
      categoryId: cat.id,
      unit: 'PIECE',
      purchaseCost: '200.00',
      sellingPrice: '300.00',
      initialQuantity: '0',
      minStockLevel: '5',
    });
    const prodNeg = await createProduct(shop.id, {
      name: 'ProdNeg',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '80.00',
      initialQuantity: '0',
      minStockLevel: '1',
    });
    const prodArch = await createProduct(shop.id, {
      name: 'ProdArch',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '80.00',
      initialQuantity: '2',
      minStockLevel: '0',
    });

    // Make ProdNeg have -2 stock (BR-RP6 ignores negative stock in valuation)
    await prisma.product.update({
      where: { id: prodNeg.id },
      data: { quantityOnHand: -2, averageCost: 50 },
    });
    // Archive ProdArch (BR-P6, BR-RP6: still included in inventory value = 2 * 50 = 100.00)
    await prisma.product.update({
      where: { id: prodArch.id },
      data: { archivedAt: new Date() },
    });

    // Purchase: 10 ProdA @ 100 = 1000, 5 ProdB @ 200 = 1000 -> total 2000.00, paid 1200.00 -> payable 800.00
    const purchaseDate = new Date('2026-10-15T10:00:00.000Z');
    await createPurchase(shop.id, {
      supplierId: sup.id,
      idempotencyKey: 'p6a-pur-1',
      amountPaid: '1200.00',
      paymentMethod: 'BANK_TRANSFER',
      occurredAt: purchaseDate.toISOString(),
      items: [
        { productId: prodA.id, quantity: '10', unitCost: '100.00' },
        { productId: prodB.id, quantity: '5', unitCost: '200.00' },
      ],
    });

    // Sale 1 (COMPLETED): 4 ProdA @ 150 = 600, discount 60 -> total 540.00, paid 200.00
    // COGS = 4 * 100 = 400.00
    const sale1Date = new Date('2026-10-15T12:00:00.000Z');
    const sale1Res = await createSale(shop.id, {
      customerId: cust.id,
      idempotencyKey: 'p6a-sale-1',
      discount: { type: 'AMOUNT', value: '60.00' },
      amountReceived: '200.00',
      paymentMethod: 'CASH',
      occurredAt: sale1Date.toISOString(),
      items: [{ productId: prodA.id, quantity: '4' }],
    });

    // Partial return on Sale 1: return 1 ProdA (refundValue = 135.00, cogsReversed = 100.00)
    // Net revenue from Sale 1 = 540 - 135 = 405.00, Net COGS = 400 - 100 = 300.00
    // Excess = 200 - 405 = -205 <= 0 -> no cash refund, customer balance = 205.00
    // Return occurred on a later date (Oct 17), attributed to original sale date Oct 15 (BR-R7/BR-RP1)
    await createSaleReturn(shop.id, sale1Res.sale.id, {
      reason: 'Customer changed mind',
      occurredAt: new Date('2026-10-17T10:00:00.000Z').toISOString(),
      items: [{ saleItemId: sale1Res.sale.items![0]!.id, quantity: '1' }],
    });

    // Sale 2 (CANCELLED): 2 ProdB @ 300 = 600.00, paid 600.00, then cancelled -> excluded from revenue & COGS, cash refunded
    const sale2Res = await createSale(shop.id, {
      customerId: cust.id,
      idempotencyKey: 'p6a-sale-2',
      amountReceived: '600.00',
      paymentMethod: 'CASH',
      occurredAt: new Date('2026-10-15T14:00:00.000Z').toISOString(),
      items: [{ productId: prodB.id, quantity: '2' }],
    });
    await cancelSale(shop.id, sale2Res.sale.id, {
      reason: 'Order cancelled',
      refundMethod: 'CASH',
    });
    await prisma.payment.updateMany({
      where: { shopId: shop.id, saleId: sale2Res.sale.id, kind: 'SALE_REFUND' },
      data: { paidAt: new Date('2026-10-15T14:30:00.000Z') },
    });

    // Damaged stock write-off: 1 ProdB @ 200.00 -> writeOffs = 200.00 (BR-RP11: separate, not in net profit)
    await adjustProductStock(shop.id, prodB.id, {
      type: 'DAMAGED',
      quantityChange: '-1',
      reason: 'Screen cracked',
    });
    await prisma.stockMovement.updateMany({
      where: { shopId: shop.id, productId: prodB.id, type: 'DAMAGED' },
      data: { occurredAt: new Date('2026-10-15T15:00:00.000Z') },
    });

    // Expense: 50.00 RENT on Oct 15
    await createExpense(shop.id, {
      title: 'Shop Rent',
      category: 'RENT',
      amount: '50.00',
      expenseDate: new Date('2026-10-15T16:00:00.000Z').toISOString(),
      paymentMethod: 'CASH',
    });

    const refNow = new Date('2026-10-15T18:00:00.000Z'); // Oct 15 23:00 PKT
    const filter = { from: '2026-10-15', to: '2026-10-15' };

    const [salesRep, purRep, expRep, profitRep, invRep, perfRep, balRep, woRep, dash] =
      await Promise.all([
        getSalesReport(shop.id, filter, refNow),
        getPurchasesReport(shop.id, filter, refNow),
        getExpenseReport(shop.id, filter, refNow),
        getProfitReport(shop.id, filter, refNow),
        getInventoryValuationReport(shop.id),
        getProductPerformanceReport(shop.id, filter, refNow),
        getBalancesReport(shop.id),
        getWriteOffsReport(shop.id, filter, refNow),
        getDashboardSummary(shop.id, 'today', refNow),
      ]);

    // Sales & Profit (BR-RP1..BR-RP5, BR-RP11)
    expect(salesRep.revenue).toBe('405.00');
    expect(salesRep.cogs).toBe('300.00');
    expect(salesRep.grossProfit).toBe('105.00');
    expect(salesRep.salesCount).toBe(1);
    expect(salesRep.cancelledCount).toBe(1);
    expect(salesRep.returnedValue).toBe('135.00');

    expect(purRep.totalPurchases).toBe('2000.00');
    expect(purRep.cashPaidToSuppliers).toBe('1200.00');

    expect(expRep.totalExpenses).toBe('50.00');

    expect(profitRep.revenue).toBe('405.00');
    expect(profitRep.cogs).toBe('300.00');
    expect(profitRep.grossProfit).toBe('105.00');
    expect(profitRep.operatingExpenses).toBe('50.00');
    expect(profitRep.netOperatingProfit).toBe('55.00'); // 105 - 50; write-off 200 NOT subtracted
    expect(profitRep.writeOffs).toBe('200.00');
    expect(profitRep.cashReceived).toBe('200.00'); // 200 (sale1) + 600 (sale2) - 600 (cancel refund) = 200
    expect(profitRep.cashPaidToSuppliers).toBe('1200.00');

    expect(woRep.totalWriteOffValue).toBe('200.00');
    expect(woRep.count).toBe(1);

    // Inventory valuation (BR-RP6, BR-P6):
    // ProdA qty = 10 - 4 + 1 = 7 @ 100 = 700.00
    // ProdB qty = 5 - 2 + 2 - 1 = 4 @ 200 = 800.00
    // ProdNeg qty = -2 -> max(-2, 0) = 0 -> 0.00
    // ProdArch qty = 2 @ 50 = 100.00 (archived INCLUDED)
    // Total = 1600.00
    expect(invRep.totalValue).toBe('1600.00');
    expect(invRep.activeProductCount).toBe(3); // ProdA, ProdB, ProdNeg
    expect(invRep.totalProductCount).toBe(4);
    expect(invRep.negativeStockCount).toBe(1);

    // Best-selling (BR-RP8): only ProdA net 3 sold, rev 405.00
    expect(perfRep.bestSelling).toHaveLength(1);
    expect(perfRep.bestSelling[0]!.name).toBe('ProdA');
    expect(perfRep.bestSelling[0]!.netQuantitySold).toBe('3.000');
    expect(perfRep.bestSelling[0]!.netRevenue).toBe('405.00');

    // Balances (BR-RP7)
    expect(balRep.totalCustomerOutstanding).toBe('205.00');
    expect(balRep.totalSupplierPayable).toBe('800.00');

    // Dashboard (BR-RP12)
    expect(dash.sales).toBe('405.00');
    expect(dash.expenses).toBe('50.00');
    expect(dash.estimatedProfit).toBe('55.00');
    expect(dash.cashReceived).toBe('200.00');
    expect(dash.productCount).toBe(3);
    expect(dash.inventoryValue).toBe('1600.00');
    expect(dash.customerOutstanding).toBe('205.00');
    expect(dash.recentSales).toHaveLength(2);
    expect(dash.recentPurchases).toHaveLength(1);
    expect(dash.salesChart).toEqual([{ date: '2026-10-15', revenue: '405.00', salesCount: 1 }]);
  });

  it('BR-RP9 & BR-RP10: enforces 30-day slow-moving boundary and Asia/Karachi midnight boundaries', async () => {
    expect(SLOW_MOVING_DAYS).toBe(30);

    const { shop } = await registerOwnerAndShop({
      email: 'boundary@phase6a.test',
      password: 'Password123',
      ownerName: 'Boundary Owner',
      shopName: 'Boundary Shop',
      shopType: 'GENERAL_RETAIL',
    });

    const now = new Date('2026-10-16T06:00:00.000Z'); // Oct 16 11:00 PKT
    const d40Ago = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const d31Ago = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const d29Ago = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const d20Ago = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    // 1) Never sold, created 40 days ago -> SLOW
    const pNeverOld = await createProduct(shop.id, {
      name: 'NeverSoldOld',
      unit: 'PIECE',
      purchaseCost: '10.00',
      sellingPrice: '20.00',
      initialQuantity: '5',
      minStockLevel: '0',
    });
    await prisma.product.update({ where: { id: pNeverOld.id }, data: { createdAt: d40Ago } });

    // 2) Never sold, created 20 days ago -> NOT slow
    const pNeverNew = await createProduct(shop.id, {
      name: 'NeverSoldNew',
      unit: 'PIECE',
      purchaseCost: '10.00',
      sellingPrice: '20.00',
      initialQuantity: '5',
      minStockLevel: '0',
    });
    await prisma.product.update({ where: { id: pNeverNew.id }, data: { createdAt: d20Ago } });

    // 3) Sold 31 days ago -> SLOW
    const pSold31 = await createProduct(shop.id, {
      name: 'Sold31Ago',
      unit: 'PIECE',
      purchaseCost: '10.00',
      sellingPrice: '20.00',
      initialQuantity: '5',
      minStockLevel: '0',
    });
    await createSale(shop.id, {
      idempotencyKey: 'p6a-b-1',
      amountReceived: '20.00',
      paymentMethod: 'CASH',
      occurredAt: d31Ago.toISOString(),
      items: [{ productId: pSold31.id, quantity: '1' }],
    });

    // 4) Sold 29 days ago -> NOT slow
    const pSold29 = await createProduct(shop.id, {
      name: 'Sold29Ago',
      unit: 'PIECE',
      purchaseCost: '10.00',
      sellingPrice: '20.00',
      initialQuantity: '5',
      minStockLevel: '0',
    });
    await createSale(shop.id, {
      idempotencyKey: 'p6a-b-2',
      amountReceived: '20.00',
      paymentMethod: 'CASH',
      occurredAt: d29Ago.toISOString(),
      items: [{ productId: pSold29.id, quantity: '1' }],
    });

    const perf = await getProductPerformanceReport(shop.id, { period: 'today' }, now);
    const slowNames = perf.slowMoving.map((p) => p.name).sort();
    expect(slowNames).toEqual(['NeverSoldOld', 'Sold31Ago']);

    // Midnight boundary in Asia/Karachi (UTC+5):
    // 2026-10-15T18:59:59Z = 2026-10-15 23:59:59 PKT (yesterday)
    // 2026-10-15T19:00:00Z = 2026-10-16 00:00:00 PKT (today)
    await createSale(shop.id, {
      idempotencyKey: 'p6a-b-pkt-yday',
      amountReceived: '20.00',
      paymentMethod: 'CASH',
      occurredAt: '2026-10-15T18:59:59.000Z',
      items: [{ productId: pSold29.id, quantity: '1' }],
    });
    await createSale(shop.id, {
      idempotencyKey: 'p6a-b-pkt-today',
      amountReceived: '20.00',
      paymentMethod: 'CASH',
      occurredAt: '2026-10-15T19:00:00.000Z',
      items: [{ productId: pSold29.id, quantity: '1' }],
    });

    const todaySales = await getSalesReport(shop.id, { period: 'today' }, now);
    expect(todaySales.salesCount).toBe(1);
    expect(todaySales.revenue).toBe('20.00');
  });
});
