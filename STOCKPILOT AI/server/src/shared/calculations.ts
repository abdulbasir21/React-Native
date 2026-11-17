import type { PaymentKind, PaymentStatus, SaleStatus, StockMovementType } from './enums.js';
import {
  dec,
  ExactDecimal,
  maxDecimal,
  round2,
  round3,
  round4,
  sumMoney,
} from './money.js';

export function lineSubtotal(quantity: string | number, unitPrice: string | number): string {
  const q = dec(quantity);
  const p = dec(unitPrice);
  if (q.lte(0)) {
    throw new Error('Line quantity must be > 0');
  }
  if (p.lt(0)) {
    throw new Error('Line unit price must be >= 0');
  }
  return round2(q.times(p));
}

export function lineCogs(quantity: string | number, unitCostSnapshot: string | number): string {
  const q = dec(quantity);
  const c = dec(unitCostSnapshot);
  if (q.lte(0)) {
    throw new Error('Quantity must be > 0');
  }
  if (c.lt(0)) {
    throw new Error('Unit cost snapshot must be >= 0');
  }
  return round2(q.times(c));
}

export interface DiscountInput {
  type: 'AMOUNT' | 'PERCENT';
  value: string | number;
}

export function applyDiscount(
  subtotalInput: string | number,
  discount?: DiscountInput | null,
): { discountAmount: string; total: string } {
  const subtotal = dec(round2(subtotalInput));
  if (subtotal.lt(0)) {
    throw new Error('Subtotal must be >= 0');
  }
  if (!discount) {
    return {
      discountAmount: '0.00',
      total: round2(subtotal),
    };
  }

  const rawValue = dec(discount.value);
  if (rawValue.lt(0)) {
    throw new Error('Discount value must be >= 0');
  }

  let discountAmountDec: typeof subtotal;
  if (discount.type === 'PERCENT') {
    if (rawValue.gt(100)) {
      throw new Error('Discount percent must be between 0 and 100');
    }
    discountAmountDec = dec(round2(subtotal.times(rawValue).div(100)));
  } else {
    discountAmountDec = dec(round2(rawValue));
  }

  if (discountAmountDec.gt(subtotal)) {
    throw new Error('Discount amount cannot exceed subtotal');
  }

  return {
    discountAmount: round2(discountAmountDec),
    total: round2(subtotal.minus(discountAmountDec)),
  };
}

export interface DiscountAllocationLine {
  lineSubtotal: string;
  allocatedDiscount: string;
  lineNet: string;
}

export function allocateDiscount(
  lineSubtotals: ReadonlyArray<string | number>,
  discountAmountInput: string | number,
): DiscountAllocationLine[] {
  if (lineSubtotals.length === 0) {
    throw new Error('At least one line is required to allocate discount');
  }

  const normalizedLines = lineSubtotals.map((s) => round2(s));
  const subtotal = dec(sumMoney(normalizedLines));
  const discountAmount = dec(round2(discountAmountInput));

  if (discountAmount.lt(0) || discountAmount.gt(subtotal)) {
    throw new Error('Discount amount must be between 0 and subtotal');
  }

  if (discountAmount.eq(0) || subtotal.eq(0)) {
    return normalizedLines.map((ls) => ({
      lineSubtotal: ls,
      allocatedDiscount: '0.00',
      lineNet: ls,
    }));
  }

  let allocatedSoFar = new ExactDecimal(0);
  return normalizedLines.map((ls, idx) => {
    const lineSub = dec(ls);
    const isLast = idx === normalizedLines.length - 1;
    const allocated = isLast
      ? dec(round2(discountAmount.minus(allocatedSoFar)))
      : dec(round2(discountAmount.times(lineSub).div(subtotal)));
    allocatedSoFar = allocatedSoFar.plus(allocated);
    return {
      lineSubtotal: ls,
      allocatedDiscount: round2(allocated),
      lineNet: round2(lineSub.minus(allocated)),
    };
  });
}

export function weightedAverage(
  currentQtyInput: string | number,
  currentAvgCostInput: string | number,
  addedQtyInput: string | number,
  addedUnitCostInput: string | number,
): string {
  const currentQty = dec(currentQtyInput);
  const currentAvgCost = dec(currentAvgCostInput);
  const addedQty = dec(addedQtyInput);
  const addedUnitCost = dec(addedUnitCostInput);

  if (addedQty.lte(0)) {
    throw new Error('Added quantity must be > 0');
  }
  if (addedUnitCost.lt(0) || currentAvgCost.lt(0)) {
    throw new Error('Costs must be >= 0');
  }

  // BR-C6: Negative stock counts as 0 inside the BR-C1 formula
  const effectiveQty = maxDecimal(currentQty, 0);
  const denominator = effectiveQty.plus(addedQty);
  const numerator = effectiveQty.times(currentAvgCost).plus(addedQty.times(addedUnitCost));
  return round4(numerator.div(denominator));
}

export function costAfterAdjustment(
  currentAvgCostInput: string | number,
  _movementType: Extract<StockMovementType, 'DAMAGED' | 'EXPIRED' | 'ADJUSTMENT'>,
): string {
  return round4(currentAvgCostInput);
}

export interface SalePaymentLike {
  kind: Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>;
  amount: string | number;
}

export function derivePaymentStatus(
  netTotalInput: string | number,
  amountPaidInput: string | number,
): PaymentStatus {
  const netTotal = dec(round2(netTotalInput));
  const amountPaid = dec(round2(amountPaidInput));

  if (netTotal.eq(0)) {
    return 'NOT_APPLICABLE';
  }
  if (amountPaid.lte(0)) {
    return 'UNPAID';
  }
  if (amountPaid.lt(netTotal)) {
    return 'PARTIAL';
  }
  return 'PAID';
}

export function deriveSaleFinancials(input: {
  total: string | number;
  returnedValue: string | number;
  status: SaleStatus;
  payments: readonly SalePaymentLike[];
}): {
  amountPaid: string;
  netTotal: string;
  balanceDue: string;
  paymentStatus: PaymentStatus;
} {
  let paid = new ExactDecimal(0);
  for (const p of input.payments) {
    const amt = dec(round2(p.amount));
    if (p.kind === 'SALE_PAYMENT') {
      paid = paid.plus(amt);
    } else if (p.kind === 'SALE_REFUND') {
      paid = paid.minus(amt);
    }
  }

  const netTotalDec =
    input.status === 'CANCELLED'
      ? new ExactDecimal(0)
      : maxDecimal(dec(round2(input.total)).minus(dec(round2(input.returnedValue))), 0);

  const balanceDueDec = maxDecimal(netTotalDec.minus(paid), 0);
  const amountPaidStr = round2(paid);
  const netTotalStr = round2(netTotalDec);
  const balanceDueStr = round2(balanceDueDec);

  return {
    amountPaid: amountPaidStr,
    netTotal: netTotalStr,
    balanceDue: balanceDueStr,
    paymentStatus: derivePaymentStatus(netTotalStr, amountPaidStr),
  };
}

export function derivePurchaseFinancials(input: {
  total: string | number;
  payments: ReadonlyArray<{ amount: string | number }>;
}): {
  amountPaid: string;
  balanceDue: string;
  paymentStatus: PaymentStatus;
} {
  const total = dec(round2(input.total));
  let paid = new ExactDecimal(0);
  for (const p of input.payments) {
    paid = paid.plus(dec(round2(p.amount)));
  }
  const balanceDueDec = maxDecimal(total.minus(paid), 0);
  const amountPaidStr = round2(paid);

  return {
    amountPaid: amountPaidStr,
    balanceDue: round2(balanceDueDec),
    paymentStatus: derivePaymentStatus(round2(total), amountPaidStr),
  };
}

export function refundValue(input: {
  lineNet: string | number;
  lineCogs: string | number;
  soldQty: string | number;
  returnQty: string | number;
  alreadyReturnedQty: string | number;
  alreadyRefundedValue: string | number;
  alreadyReversedCogs: string | number;
}): { refundValue: string; cogsReversed: string } {
  const lineNet = dec(round2(input.lineNet));
  const lineCogs = dec(round2(input.lineCogs));
  const soldQty = dec(round3(input.soldQty));
  const returnQty = dec(round3(input.returnQty));
  const alreadyReturnedQty = dec(round3(input.alreadyReturnedQty));
  const alreadyRefunded = dec(round2(input.alreadyRefundedValue));
  const alreadyReversedCogs = dec(round2(input.alreadyReversedCogs));

  if (returnQty.lte(0)) {
    throw new Error('Return quantity must be > 0');
  }
  const newReturnedTotal = alreadyReturnedQty.plus(returnQty);
  if (newReturnedTotal.gt(soldQty)) {
    throw new Error('Returned quantity exceeds remaining sold quantity');
  }

  if (newReturnedTotal.eq(soldQty)) {
    return {
      refundValue: round2(maxDecimal(lineNet.minus(alreadyRefunded), 0)),
      cogsReversed: round2(maxDecimal(lineCogs.minus(alreadyReversedCogs), 0)),
    };
  }

  return {
    refundValue: round2(lineNet.times(returnQty).div(soldQty)),
    cogsReversed: round2(lineCogs.times(returnQty).div(soldQty)),
  };
}

export function formatReceiptNo(localDateYYYYMMDD: string, sequence: number): string {
  if (!/^\d{8}$/.test(localDateYYYYMMDD)) {
    throw new Error('Receipt date must be YYYYMMDD');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Receipt sequence must be a positive integer');
  }
  const seqStr = String(sequence).padStart(4, '0');
  return `RCP-${localDateYYYYMMDD}-${seqStr}`;
}

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeekMon0: number; // 0 = Mon ... 6 = Sun
  dateString: string; // YYYY-MM-DD
  compactDate: string; // YYYYMMDD
}

const WEEKDAY_MON0_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function getLocalParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour) % 24;
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);
  const dayOfWeekMon0 = WEEKDAY_MON0_MAP[lookup.weekday ?? 'Mon'] ?? 0;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeekMon0,
    dateString: `${year}-${mm}-${dd}`,
    compactDate: `${year}${mm}${dd}`,
  };
}

export function localMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let candidate = targetAsUtc;

  for (let i = 0; i < 2; i += 1) {
    const p = getLocalParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = actualAsUtc - targetAsUtc;
    candidate -= diff;
  }

  return new Date(candidate);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number; dateString: string } {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const dayNum = d.getUTCDate();
  return {
    year: y,
    month: m,
    day: dayNum,
    dateString: `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
  };
}

export type ReportPeriod = 'today' | 'week' | 'month';

export function periodBounds(
  period: ReportPeriod,
  timeZone: string,
  now: Date = new Date(),
): {
  startUtc: Date;
  endUtc: Date;
  startLocalDate: string;
  endLocalDate: string;
} {
  const localNow = getLocalParts(now, timeZone);

  if (period === 'today') {
    const startUtc = localMidnightToUtc(localNow.year, localNow.month, localNow.day, timeZone);
    const nextDay = addCalendarDays(localNow.year, localNow.month, localNow.day, 1);
    const endUtc = localMidnightToUtc(nextDay.year, nextDay.month, nextDay.day, timeZone);
    return {
      startUtc,
      endUtc,
      startLocalDate: localNow.dateString,
      endLocalDate: localNow.dateString,
    };
  }

  if (period === 'week') {
    const monday = addCalendarDays(
      localNow.year,
      localNow.month,
      localNow.day,
      -localNow.dayOfWeekMon0,
    );
    const sunday = addCalendarDays(monday.year, monday.month, monday.day, 6);
    const nextMonday = addCalendarDays(monday.year, monday.month, monday.day, 7);
    return {
      startUtc: localMidnightToUtc(monday.year, monday.month, monday.day, timeZone),
      endUtc: localMidnightToUtc(nextMonday.year, nextMonday.month, nextMonday.day, timeZone),
      startLocalDate: monday.dateString,
      endLocalDate: sunday.dateString,
    };
  }

  // calendar month
  const startUtc = localMidnightToUtc(localNow.year, localNow.month, 1, timeZone);
  const firstOfNextMonth = new Date(Date.UTC(localNow.year, localNow.month, 1));
  const lastDayOfMonth = new Date(Date.UTC(localNow.year, localNow.month, 0));
  const endUtc = localMidnightToUtc(
    firstOfNextMonth.getUTCFullYear(),
    firstOfNextMonth.getUTCMonth() + 1,
    firstOfNextMonth.getUTCDate(),
    timeZone,
  );
  const startLocalDate = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-01`;
  const endLocalDate = `${lastDayOfMonth.getUTCFullYear()}-${String(lastDayOfMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDayOfMonth.getUTCDate()).padStart(2, '0')}`;

  return {
    startUtc,
    endUtc,
    startLocalDate,
    endLocalDate,
  };
}

export function customDateRangeBounds(
  fromLocalDate: string,
  toLocalDate: string,
  timeZone: string,
): { startUtc: Date; endUtc: Date } {
  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromLocalDate);
  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toLocalDate);
  if (!fromMatch || !toMatch) {
    throw new Error('Dates must be in YYYY-MM-DD format');
  }
  const fy = Number(fromMatch[1]);
  const fm = Number(fromMatch[2]);
  const fd = Number(fromMatch[3]);
  const ty = Number(toMatch[1]);
  const tm = Number(toMatch[2]);
  const td = Number(toMatch[3]);

  const startUtc = localMidnightToUtc(fy, fm, fd, timeZone);
  const dayAfterTo = addCalendarDays(ty, tm, td, 1);
  const endUtc = localMidnightToUtc(dayAfterTo.year, dayAfterTo.month, dayAfterTo.day, timeZone);
  if (endUtc.getTime() <= startUtc.getTime()) {
    throw new Error('End date must be on or after start date');
  }
  return { startUtc, endUtc };
}

export interface PaymentAllocationTarget {
  id: string;
  balanceDue: string | number;
}

export interface PaymentAllocation {
  targetId: string;
  amount: string;
}

/**
 * BR-PU6, BR-PAY3:
 * Allocates a payment amount across open balances in oldest-first order.
 * Expects targets pre-sorted from oldest to newest.
 */
export function allocateOldestFirst(
  targets: readonly PaymentAllocationTarget[],
  paymentAmountInput: string | number,
): PaymentAllocation[] {
  const paymentAmount = dec(round2(paymentAmountInput));
  if (paymentAmount.lte(0)) {
    throw new Error('Payment amount must be > 0');
  }

  const positiveTargets = targets
    .map((t) => ({ id: t.id, balance: dec(round2(t.balanceDue)) }))
    .filter((t) => t.balance.gt(0));

  let totalBalance = new ExactDecimal(0);
  for (const t of positiveTargets) {
    totalBalance = totalBalance.plus(t.balance);
  }

  if (paymentAmount.gt(totalBalance)) {
    throw new Error('Payment exceeds total open balance');
  }

  let remaining = paymentAmount;
  const allocations: PaymentAllocation[] = [];
  for (const t of positiveTargets) {
    if (remaining.lte(0)) break;
    const allocated = remaining.lte(t.balance) ? remaining : t.balance;
    if (allocated.gt(0)) {
      allocations.push({ targetId: t.id, amount: round2(allocated) });
      remaining = remaining.minus(allocated);
    }
  }
  return allocations;
}

/**
 * BR-E1: Expense date may not be later than tomorrow in shop local timezone.
 */
export function isExpenseDateAllowed(
  expenseDate: Date,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  const localExpense = getLocalParts(expenseDate, timeZone);
  const localNow = getLocalParts(now, timeZone);
  const tomorrow = addCalendarDays(localNow.year, localNow.month, localNow.day, 1);
  return localExpense.dateString <= tomorrow.dateString;
}
