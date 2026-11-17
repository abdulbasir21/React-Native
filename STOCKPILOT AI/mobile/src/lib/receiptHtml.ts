import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ReceiptDataDTO } from '../repositories/saleRepository';
import { cmpDecimal, formatMoneyWithCurrency } from '../shared/money';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatReceiptDateTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function buildReceiptHtml(data: ReceiptDataDTO): string {
  const { shop, sale } = data;
  const cur = shop.currency || 'PKR';
  const items = sale.items ?? [];
  const hasDiscount = cmpDecimal(sale.discountAmount, 0) > 0;
  const hasBalance = cmpDecimal(sale.balanceDue, 0) > 0;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td class="item-name">
          <div>${escapeHtml(item.productNameSnapshot)}</div>
          <div class="item-meta">${escapeHtml(item.quantity)} ${escapeHtml(item.unitSnapshot)} × ${escapeHtml(formatMoneyWithCurrency(item.unitPrice, cur))}</div>
        </td>
        <td class="item-total">${escapeHtml(formatMoneyWithCurrency(item.lineNet, cur))}</td>
      </tr>
    `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(sale.receiptNo)}</title>
  <style>
    @page { margin: 14px; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; padding: 16px; background: #ffffff; color: #101828; font-size: 13px; }
    .receipt { max-width: 420px; margin: 0 auto; border: 1px solid #e6e9e4; border-radius: 12px; padding: 18px; }
    .header { text-align: center; border-bottom: 1px dashed #d0d5dd; padding-bottom: 12px; margin-bottom: 12px; }
    .shop-name { font-size: 18px; font-weight: 700; color: #064b3f; margin: 0 0 4px; }
    .muted { color: #667085; font-size: 12px; margin: 2px 0; }
    .meta { margin-bottom: 12px; border-bottom: 1px dashed #d0d5dd; padding-bottom: 10px; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .label { color: #667085; }
    .value { font-weight: 600; color: #101828; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    td { padding: 6px 0; border-bottom: 1px solid #f2f4f7; vertical-align: top; }
    .item-name { font-weight: 500; }
    .item-meta { font-size: 11px; color: #667085; margin-top: 2px; }
    .item-total { text-align: right; font-weight: 600; white-space: nowrap; }
    .totals { border-top: 1px dashed #d0d5dd; padding-top: 10px; }
    .grand { font-size: 16px; font-weight: 800; color: #0b6e5c; margin: 6px 0; }
    .due { color: #b54708; font-weight: 700; }
    .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #667085; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1 class="shop-name">${escapeHtml(shop.name)}</h1>
      ${shop.address ? `<p class="muted">${escapeHtml(shop.address)}</p>` : ''}
      ${shop.phone ? `<p class="muted">Tel: ${escapeHtml(shop.phone)}</p>` : ''}
    </div>

    <div class="meta">
      <div class="row"><span class="label">Receipt #</span><span class="value">${escapeHtml(sale.receiptNo)}</span></div>
      <div class="row"><span class="label">Date</span><span class="value">${escapeHtml(formatReceiptDateTime(sale.occurredAt, shop.timezone))}</span></div>
      <div class="row"><span class="label">Customer</span><span class="value">${escapeHtml(sale.customer?.name ?? 'Walk-in Customer')}</span></div>
      <div class="row"><span class="label">Method</span><span class="value">${escapeHtml(sale.paymentMethod)}</span></div>
      <div class="row"><span class="label">Status</span><span class="value">${escapeHtml(sale.paymentStatus)}</span></div>
    </div>

    <table>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span class="label">Subtotal</span><span class="value">${escapeHtml(formatMoneyWithCurrency(sale.subtotal, cur))}</span></div>
      ${
        hasDiscount
          ? `<div class="row"><span class="label">Discount</span><span class="value">-${escapeHtml(formatMoneyWithCurrency(sale.discountAmount, cur))}</span></div>`
          : ''
      }
      <div class="row grand"><span>Total</span><span>${escapeHtml(formatMoneyWithCurrency(sale.total, cur))}</span></div>
      <div class="row"><span class="label">Amount Paid</span><span class="value">${escapeHtml(formatMoneyWithCurrency(sale.amountPaid, cur))}</span></div>
      ${
        hasBalance
          ? `<div class="row due"><span>Balance Due</span><span>${escapeHtml(formatMoneyWithCurrency(sale.balanceDue, cur))}</span></div>`
          : ''
      }
    </div>

    ${sale.note ? `<p class="muted" style="margin-top:10px;">Note: ${escapeHtml(sale.note)}</p>` : ''}
    <div class="footer">Thank you for your business! Powered by StockPilot AI</div>
  </div>
</body>
</html>`;
}

export function formatReceiptText(data: ReceiptDataDTO): string {
  const { shop, sale } = data;
  const cur = shop.currency || 'PKR';
  const lines = [
    shop.name,
    shop.address ?? '',
    shop.phone ? `Tel: ${shop.phone}` : '',
    '--------------------------------',
    `Receipt: ${sale.receiptNo}`,
    `Date: ${formatReceiptDateTime(sale.occurredAt, shop.timezone)}`,
    `Customer: ${sale.customer?.name ?? 'Walk-in Customer'}`,
    '--------------------------------',
    ...(sale.items ?? []).map(
      (i) =>
        `${i.productNameSnapshot} (${i.quantity} ${i.unitSnapshot} x ${formatMoneyWithCurrency(i.unitPrice, cur)}) = ${formatMoneyWithCurrency(i.lineNet, cur)}`,
    ),
    '--------------------------------',
    `Subtotal: ${formatMoneyWithCurrency(sale.subtotal, cur)}`,
    ...(cmpDecimal(sale.discountAmount, 0) > 0
      ? [`Discount: -${formatMoneyWithCurrency(sale.discountAmount, cur)}`]
      : []),
    `TOTAL: ${formatMoneyWithCurrency(sale.total, cur)}`,
    `Paid (${sale.paymentMethod}): ${formatMoneyWithCurrency(sale.amountPaid, cur)}`,
    ...(cmpDecimal(sale.balanceDue, 0) > 0
      ? [`Balance Due: ${formatMoneyWithCurrency(sale.balanceDue, cur)}`]
      : []),
    `Status: ${sale.paymentStatus}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function shareReceiptText(data: ReceiptDataDTO): Promise<void> {
  const { Share } = await import('react-native');
  await Share.share({
    title: `Receipt ${data.sale.receiptNo}`,
    message: formatReceiptText(data),
  });
}

export async function exportAndShareReceiptPdf(data: ReceiptDataDTO): Promise<string> {
  const html = buildReceiptHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Receipt ${data.sale.receiptNo}`,
    });
  }
  return uri;
}
