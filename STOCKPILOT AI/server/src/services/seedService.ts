import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { dec, round2, round4 } from '../shared/money.js';

const DEMO_EMAIL = 'demo@stockpilot.app';

const CATEGORIES = [
  'Chargers & Cables',
  'Audio & Earbuds',
  'Screen Protectors',
  'Phone Cases',
  'Power Banks',
] as const;

const PRODUCT_TEMPLATES = [
  // Chargers & Cables (5)
  { cat: 0, name: '20W USB-C Fast Adapter', sku: 'CHG-20W', cost: '650.00', price: '1200.00', init: '30', min: '5' },
  { cat: 0, name: '33W GaN Dual Charger', sku: 'CHG-33W', cost: '1100.00', price: '1950.00', init: '20', min: '4' },
  { cat: 0, name: 'USB-C to Lightning Braided 1m', sku: 'CBL-C2L', cost: '220.00', price: '550.00', init: '50', min: '10' },
  { cat: 0, name: 'USB-C to USB-C 60W Cable', sku: 'CBL-C2C', cost: '180.00', price: '450.00', init: '60', min: '10' },
  { cat: 0, name: 'Micro-USB Fast Data Cable', sku: 'CBL-MCR', cost: '90.00', price: '250.00', init: '45', min: '10' },
  // Audio & Earbuds (5)
  { cat: 1, name: 'TWS Wireless Earbuds Pro', sku: 'AUD-TWS1', cost: '1850.00', price: '3200.00', init: '18', min: '4' },
  { cat: 1, name: 'Neckband Bluetooth Sport', sku: 'AUD-NK1', cost: '950.00', price: '1750.00', init: '22', min: '5' },
  { cat: 1, name: 'Wired Type-C Handsfree', sku: 'AUD-WTC', cost: '280.00', price: '650.00', init: '40', min: '8' },
  { cat: 1, name: '3.5mm Stereo Earphones', sku: 'AUD-35M', cost: '160.00', price: '400.00', init: '55', min: '10' },
  { cat: 1, name: 'Mini Bluetooth Speaker', sku: 'AUD-SPK', cost: '1400.00', price: '2500.00', init: '12', min: '3' },
  // Screen Protectors (5)
  { cat: 2, name: '9D Tempered Glass iPhone 15', sku: 'SCR-IP15', cost: '85.00', price: '350.00', init: '80', min: '15' },
  { cat: 2, name: '9D Tempered Glass iPhone 14', sku: 'SCR-IP14', cost: '80.00', price: '320.00', init: '70', min: '15' },
  { cat: 2, name: 'Matte Gaming Glass Samsung A55', sku: 'SCR-A55', cost: '110.00', price: '400.00', init: '50', min: '10' },
  { cat: 2, name: 'Privacy Glass Universal 6.7"', sku: 'SCR-PRV', cost: '150.00', price: '550.00', init: '35', min: '8' },
  { cat: 2, name: 'Camera Lens Ring Protector', sku: 'SCR-LNS', cost: '70.00', price: '250.00', init: '65', min: '12' },
  // Phone Cases (5)
  { cat: 3, name: 'MagSafe Clear Case iPhone 15', sku: 'CAS-MG15', cost: '320.00', price: '850.00', init: '35', min: '6' },
  { cat: 3, name: 'Silicone Soft Case iPhone 14', sku: 'CAS-SL14', cost: '210.00', price: '600.00', init: '40', min: '8' },
  { cat: 3, name: 'Armor Shockproof Case S24', sku: 'CAS-S24', cost: '380.00', price: '950.00', init: '25', min: '5' },
  { cat: 3, name: 'Leather Flip Cover A55', sku: 'CAS-FL55', cost: '420.00', price: '1100.00', init: '20', min: '4' },
  { cat: 3, name: 'Transparent TPU Case Redmi 13', sku: 'CAS-RD13', cost: '95.00', price: '300.00', init: '60', min: '10' },
  // Power Banks (4) -> Total 24 products
  { cat: 4, name: '10000mAh Slim Power Bank', sku: 'PWR-10K', cost: '1900.00', price: '3400.00', init: '16', min: '4' },
  { cat: 4, name: '20000mAh 22.5W Fast Power Bank', sku: 'PWR-20K', cost: '2950.00', price: '4900.00', init: '12', min: '3' },
  { cat: 4, name: 'MagSafe 5000mAh Wireless Pack', sku: 'PWR-MG5', cost: '2400.00', price: '4200.00', init: '10', min: '3' },
  { cat: 4, name: 'Car Fast Charger Dual USB-C', sku: 'PWR-CAR', cost: '480.00', price: '980.00', init: '28', min: '5' },
] as const;

export async function seedDemoShop(
  prisma: PrismaClient,
  email: string = DEMO_EMAIL,
): Promise<{ shopId: string; seeded: boolean }> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { shopId: true },
  });
  if (existingUser) {
    return { shopId: existingUser.shopId, seeded: false };
  }

  const demoPassword = process.env.DEMO_OWNER_PASSWORD || 'DemoOwner123!';
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const shop = await prisma.shop.create({
    data: {
      name: 'Al-Madina Mobile Accessories',
      type: 'MOBILE_ACCESSORIES',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      address: 'Hall Road Mobile Market, Lahore',
      phone: '+92-300-5550101',
    },
  });

  await prisma.user.create({
    data: {
      shopId: shop.id,
      email,
      passwordHash,
      ownerName: 'Tariq Mahmood',
      phone: '+92-300-5550101',
      role: 'OWNER',
    },
  });

  const categories = await Promise.all(
    CATEGORIES.map((name) =>
      prisma.category.create({
        data: { shopId: shop.id, name },
      }),
    ),
  );

  // 24 products + initial stock movements
  const products: Array<{
    id: string;
    name: string;
    cost: string;
    price: string;
    qty: number;
  }> = [];

  for (const tpl of PRODUCT_TEMPLATES) {
    const p = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: categories[tpl.cat]!.id,
        name: tpl.name,
        sku: tpl.sku,
        unit: 'PIECE',
        purchaseCost: tpl.cost,
        lastPurchaseCost: tpl.cost,
        sellingPrice: tpl.price,
        quantityOnHand: tpl.init,
        averageCost: round4(tpl.cost),
        minStockLevel: tpl.min,
      },
    });
    const initQty = Number(tpl.init);
    await prisma.stockMovement.create({
      data: {
        shopId: shop.id,
        productId: p.id,
        type: 'INITIAL_STOCK',
        quantityChange: tpl.init,
        previousQty: '0',
        newQty: tpl.init,
        reason: 'Initial demo inventory',
      },
    });
    products.push({
      id: p.id,
      name: p.name,
      cost: tpl.cost,
      price: tpl.price,
      qty: initQty,
    });
  }

  // 4 Suppliers
  const suppliers = await Promise.all(
    [
      { name: 'Al-Noor Wholesale Electronics', phone: '0300-1112233', address: 'Shah Alam Market' },
      { name: 'PakTech Accessories Hub', phone: '0321-4445566', address: 'Hafeez Center' },
      { name: 'Sadaqat Mobile Parts', phone: '0333-7778899', address: 'Saddar Karachi' },
      { name: 'Prime Audio Distributors', phone: '0345-9990011', address: 'Hall Road' },
    ].map((s) => prisma.supplier.create({ data: { shopId: shop.id, ...s } })),
  );

  // 6 Customers
  const customers = await Promise.all(
    [
      { name: 'Bilal Telecom', phone: '0301-2223344' },
      { name: 'Usman Mobile Point', phone: '0312-3334455' },
      { name: 'Hamza Gadgets', phone: '0322-4445566' },
      { name: 'Zainab Accessories', phone: '0334-5556677' },
      { name: 'Farhan Repair Lab', phone: '0346-6667788' },
      { name: 'Asad Communication', phone: '0302-7778899' },
    ].map((c) => prisma.customer.create({ data: { shopId: shop.id, ...c } })),
  );

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // 10 Purchases
  for (let i = 0; i < 10; i += 1) {
    const prod = products[i % products.length]!;
    const sup = suppliers[i % suppliers.length]!;
    const qty = 5;
    const total = round2(dec(prod.cost).times(qty));
    const paid = i % 3 === 0 ? round2(dec(total).times(0.5)) : total;
    const occurredAt = daysAgo(25 - i * 2);

    const pur = await prisma.purchase.create({
      data: {
        shopId: shop.id,
        supplierId: sup.id,
        total,
        idempotencyKey: `seed-pur-${i + 1}`,
        occurredAt,
        items: {
          create: {
            productId: prod.id,
            productNameSnapshot: prod.name,
            quantity: String(qty),
            unitCost: prod.cost,
            lineTotal: total,
          },
        },
      },
    });

    if (dec(paid).gt(0)) {
      await prisma.payment.create({
        data: {
          shopId: shop.id,
          kind: 'PURCHASE_PAYMENT',
          direction: 'OUT',
          method: i % 2 === 0 ? 'CASH' : 'BANK_TRANSFER',
          amount: paid,
          paidAt: occurredAt,
          purchaseId: pur.id,
        },
      });
    }

    const prevQty = prod.qty;
    prod.qty += qty;
    await prisma.product.update({
      where: { id: prod.id },
      data: { quantityOnHand: String(prod.qty) },
    });
    await prisma.stockMovement.create({
      data: {
        shopId: shop.id,
        productId: prod.id,
        type: 'PURCHASE',
        quantityChange: String(qty),
        previousQty: String(prevQty),
        newQty: String(prod.qty),
        purchaseId: pur.id,
        occurredAt,
      },
    });
  }

  // 60 Sales
  const saleMethods = ['CASH', 'EASYPAISA', 'JAZZCASH', 'CARD'] as const;
  for (let i = 0; i < 60; i += 1) {
    const prod = products[i % products.length]!;
    const cust = i % 2 === 0 ? customers[i % customers.length]! : null;
    const qty = 1;
    const sub = round2(prod.price);
    const disc = i % 5 === 0 ? '50.00' : '0.00';
    const total = round2(dec(sub).minus(disc));
    const cogs = round2(prod.cost);
    const occurredAt = daysAgo(i % 28);
    const compactDate = occurredAt.toISOString().slice(0, 10).replace(/-/g, '');
    const receiptNo = `RCP-${compactDate}-${String(i + 1).padStart(4, '0')}`;
    const method = cust && i % 6 === 0 ? 'CREDIT' : saleMethods[i % saleMethods.length]!;
    const paid = method === 'CREDIT' ? '0.00' : total;

    const sale = await prisma.sale.create({
      data: {
        shopId: shop.id,
        customerId: cust?.id ?? null,
        receiptNo,
        status: 'COMPLETED',
        subtotal: sub,
        discountAmount: disc,
        total,
        paymentMethod: method,
        idempotencyKey: `seed-sale-${i + 1}`,
        occurredAt,
        items: {
          create: {
            productId: prod.id,
            productNameSnapshot: prod.name,
            unitSnapshot: 'PIECE',
            quantity: String(qty),
            unitPrice: prod.price,
            lineSubtotal: sub,
            allocatedDiscount: disc,
            lineNet: total,
            unitCostSnapshot: round4(prod.cost),
            lineCogs: cogs,
          },
        },
      },
    });

    if (dec(paid).gt(0)) {
      await prisma.payment.create({
        data: {
          shopId: shop.id,
          kind: 'SALE_PAYMENT',
          direction: 'IN',
          method,
          amount: paid,
          paidAt: occurredAt,
          saleId: sale.id,
        },
      });
    }

    const prevQty = prod.qty;
    prod.qty -= qty;
    await prisma.product.update({
      where: { id: prod.id },
      data: { quantityOnHand: String(prod.qty) },
    });
    await prisma.stockMovement.create({
      data: {
        shopId: shop.id,
        productId: prod.id,
        type: 'SALE',
        quantityChange: String(-qty),
        previousQty: String(prevQty),
        newQty: String(prod.qty),
        saleId: sale.id,
        occurredAt,
      },
    });
  }

  // 25 Expenses
  const expCats = ['RENT', 'ELECTRICITY', 'INTERNET', 'SALARIES', 'TRANSPORT', 'MAINTENANCE', 'OTHER'] as const;
  for (let i = 0; i < 25; i += 1) {
    const cat = expCats[i % expCats.length]!;
    await prisma.expense.create({
      data: {
        shopId: shop.id,
        title: `${cat.toLowerCase()} bill #${i + 1}`,
        category: cat,
        amount: String(500 + (i % 5) * 400),
        expenseDate: daysAgo(i % 27),
        paymentMethod: i % 2 === 0 ? 'CASH' : 'BANK_TRANSFER',
      },
    });
  }

  // 2 Damaged write-offs
  for (let i = 0; i < 2; i += 1) {
    const prod = products[10 + i]!;
    const prevQty = prod.qty;
    prod.qty -= 1;
    await prisma.product.update({
      where: { id: prod.id },
      data: { quantityOnHand: String(prod.qty) },
    });
    await prisma.stockMovement.create({
      data: {
        shopId: shop.id,
        productId: prod.id,
        type: 'DAMAGED',
        quantityChange: '-1',
        previousQty: String(prevQty),
        newQty: String(prod.qty),
        reason: 'Cracked during display handling',
        occurredAt: daysAgo(3 + i),
      },
    });
  }

  // 1 Stock adjustment
  {
    const prod = products[0]!;
    const prevQty = prod.qty;
    prod.qty += 2;
    await prisma.product.update({
      where: { id: prod.id },
      data: { quantityOnHand: String(prod.qty) },
    });
    await prisma.stockMovement.create({
      data: {
        shopId: shop.id,
        productId: prod.id,
        type: 'ADJUSTMENT',
        quantityChange: '2',
        previousQty: String(prevQty),
        newQty: String(prod.qty),
        reason: 'Physical stock count reconciliation',
        occurredAt: daysAgo(1),
      },
    });
  }

  return { shopId: shop.id, seeded: true };
}
