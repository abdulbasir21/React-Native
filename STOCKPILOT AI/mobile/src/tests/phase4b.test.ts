import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { buildReceiptHtml, exportAndShareReceiptPdf, formatReceiptText } from '../lib/receiptHtml';
import { saleRepository, type ReceiptDataDTO } from '../repositories/saleRepository';
import { sumMoney } from '../shared/money';
import { computeCartSummary, usePosCartStore } from '../stores/posCartStore';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Phase 4b — POS cart math, sale idempotency payload & receipt export', () => {
  it('BR-SA1, BR-SA2, BR-SA3, BR-SA4: cart golden vectors for totals, percent/amount discount allocation, change due & partial balance', () => {
    // 2 items summing to 5,000.00 -> Rs 3,000 cash -> balance 2,000.00 and customer required
    const partialSummary = computeCartSummary({
      items: [
        {
          productId: 'p1',
          name: 'Fast Charger 25W',
          unit: 'PIECE',
          defaultSellingPrice: '2000.00',
          unitPriceOverride: null,
          quantity: '2',
          quantityOnHand: '10',
        },
        {
          productId: 'p2',
          name: 'Tempered Glass',
          unit: 'PIECE',
          defaultSellingPrice: '500.00',
          unitPriceOverride: '500.00',
          quantity: '2',
          quantityOnHand: '15',
        },
      ],
      discountType: 'AMOUNT',
      discountValue: '0',
      customerId: null,
      note: '',
      paymentMethod: 'CASH',
      tenderedAmount: '3000',
    });

    expect(partialSummary.subtotal).toBe('5000.00');
    expect(partialSummary.discountAmount).toBe('0.00');
    expect(partialSummary.total).toBe('5000.00');
    expect(partialSummary.amountReceivedForServer).toBe('3000.00');
    expect(partialSummary.changeDue).toBe('0.00');
    expect(partialSummary.balanceDue).toBe('2000.00');
    expect(partialSummary.requiresCustomer).toBe(true);

    // Over-tendered cash (5,500 on 5,000 bill) shows UI changeDue 500.00 and caps server amount at 5000.00
    const changeSummary = computeCartSummary({
      items: [
        {
          productId: 'p1',
          name: 'Fast Charger 25W',
          unit: 'PIECE',
          defaultSellingPrice: '2500.00',
          unitPriceOverride: null,
          quantity: '2',
          quantityOnHand: '10',
        },
      ],
      discountType: 'AMOUNT',
      discountValue: '',
      customerId: null,
      note: '',
      paymentMethod: 'CASH',
      tenderedAmount: '5500',
    });
    expect(changeSummary.changeDue).toBe('500.00');
    expect(changeSummary.amountReceivedForServer).toBe('5000.00');
    expect(changeSummary.balanceDue).toBe('0.00');
    expect(changeSummary.requiresCustomer).toBe(false);

    // 3 uneven lines with Rs 100.00 discount: allocation sums to exact discount & net sum equals total
    const allocSummary = computeCartSummary({
      items: [
        {
          productId: 'a',
          name: 'Item A',
          unit: 'PIECE',
          defaultSellingPrice: '333.33',
          unitPriceOverride: null,
          quantity: '1',
          quantityOnHand: '5',
        },
        {
          productId: 'b',
          name: 'Item B',
          unit: 'PIECE',
          defaultSellingPrice: '333.33',
          unitPriceOverride: null,
          quantity: '1',
          quantityOnHand: '5',
        },
        {
          productId: 'c',
          name: 'Item C',
          unit: 'PIECE',
          defaultSellingPrice: '333.34',
          unitPriceOverride: null,
          quantity: '1',
          quantityOnHand: '5',
        },
      ],
      discountType: 'AMOUNT',
      discountValue: '100',
      customerId: null,
      note: '',
      paymentMethod: 'CREDIT',
      tenderedAmount: '',
    });
    expect(allocSummary.subtotal).toBe('1000.00');
    expect(allocSummary.discountAmount).toBe('100.00');
    expect(allocSummary.total).toBe('900.00');
    expect(sumMoney(allocSummary.lines.map((l) => l.allocatedDiscount))).toBe('100.00');
    expect(sumMoney(allocSummary.lines.map((l) => l.lineNet))).toBe('900.00');
    expect(allocSummary.requiresCustomer).toBe(true);
    expect(allocSummary.amountReceivedForServer).toBe('0.00');
  });

  it('posCartStore actions handle price override, discount percent, quantity validation & reset', () => {
    const store = usePosCartStore.getState();
    store.reset();
    store.addProduct({
      id: 'prod-1',
      name: 'Cat6 Cable',
      unit: 'METRE',
      sellingPrice: '120.00',
      quantityOnHand: '50.000',
    });
    store.setLineQuantity('prod-1', '2.5');
    store.setLineUnitPrice('prod-1', '100');
    store.setDiscount('PERCENT', '10');
    store.setPaymentMethod('EASYPAISA');
    store.setTenderedAmount('225');

    const summary = computeCartSummary(usePosCartStore.getState());
    expect(summary.subtotal).toBe('250.00');
    expect(summary.discountAmount).toBe('25.00');
    expect(summary.total).toBe('225.00');
    expect(summary.balanceDue).toBe('0.00');

    usePosCartStore.getState().reset();
    expect(usePosCartStore.getState().items).toHaveLength(0);
  });

  it('BR-SA6, BR-SA8: saleRepository.create sends client UUIDs, Idempotency-Key header & omits server-owned totals', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        data: { id: 'sale-1' },
      },
    } as never);

    await saleRepository.create({
      paymentMethod: 'CASH',
      amountReceived: '500',
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: '2' }],
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload, config] = postSpy.mock.calls[0]!;
    expect(url).toBe('/sales');
    const body = payload as Record<string, unknown>;
    expect(String(body.id)).toMatch(UUID_REGEX);
    expect(String(body.idempotencyKey)).toMatch(UUID_REGEX);
    expect(String(body.paymentId)).toMatch(UUID_REGEX);
    expect(body).not.toHaveProperty('total');
    expect(body).not.toHaveProperty('subtotal');
    expect(body).not.toHaveProperty('discountAmount');
    expect((config as { headers: Record<string, string> }).headers['Idempotency-Key']).toBe(
      body.idempotencyKey,
    );

    postSpy.mockRestore();
  });

  it('Receipt HTML escapes shop/customer content and exportAndShareReceiptPdf invokes Print + Sharing', async () => {
    const data: ReceiptDataDTO = {
      shop: {
        id: 's1',
        name: 'Al-Madina <Mobile> & Co',
        type: 'MOBILE_ACCESSORIES',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        address: 'Shop 4, Hall Road',
        phone: '03001234567',
      },
      sale: {
        id: 'sale-1',
        shopId: 's1',
        customerId: null,
        customer: null,
        receiptNo: 'RCP-20261114-0001',
        status: 'COMPLETED',
        subtotal: '1000.00',
        discountAmount: '100.00',
        total: '900.00',
        returnedValue: '0.00',
        netTotal: '900.00',
        amountPaid: '500.00',
        balanceDue: '400.00',
        paymentMethod: 'CASH',
        paymentStatus: 'PARTIAL',
        idempotencyKey: 'k1',
        occurredAt: '2026-11-14T10:00:00.000Z',
        cancelledAt: null,
        cancelReason: null,
        note: null,
        warnings: [],
        createdAt: '2026-11-14T10:00:00.000Z',
        items: [
          {
            id: 'si-1',
            saleId: 'sale-1',
            productId: 'p1',
            productNameSnapshot: 'USB-C Cable',
            unitSnapshot: 'PIECE',
            quantity: '2.000',
            unitPrice: '500.00',
            lineSubtotal: '1000.00',
            allocatedDiscount: '100.00',
            lineNet: '900.00',
            unitCostSnapshot: '250.0000',
            lineCogs: '500.00',
            createdAt: '2026-11-14T10:00:00.000Z',
          },
        ],
        payments: [],
      },
    };

    const html = buildReceiptHtml(data);
    expect(html).toContain('Al-Madina &lt;Mobile&gt; &amp; Co');
    expect(html).toContain('RCP-20261114-0001');
    expect(html).toContain('Balance Due');

    const text = formatReceiptText(data);
    expect(text).toContain('RCP-20261114-0001');
    expect(text).toContain('TOTAL:');

    const pdfUri = await exportAndShareReceiptPdf(data);
    expect(pdfUri).toContain('.pdf');
  });
});
