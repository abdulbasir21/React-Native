import { Decimal } from 'decimal.js';
import { DECIMAL_UNITS, type Unit } from './enums.js';

export const ExactDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type DecimalInput = string | number | Decimal;

export function dec(value: DecimalInput): Decimal {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Invalid numeric value: ${String(value)}`);
  }
  const d = new ExactDecimal(value);
  if (!d.isFinite()) {
    throw new Error(`Invalid decimal value: ${String(value)}`);
  }
  return d;
}

export function round2(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(2, ExactDecimal.ROUND_HALF_UP).toFixed(2);
}

export function round4(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(4, ExactDecimal.ROUND_HALF_UP).toFixed(4);
}

export function round3(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(3, ExactDecimal.ROUND_HALF_UP).toFixed(3);
}

export function formatMoney(value: DecimalInput): string {
  return round2(value);
}

export function formatMoneyWithCurrency(value: DecimalInput, currency = 'PKR'): string {
  const rounded = round2(value);
  const [intPart = '0', decPart = '00'] = rounded.split('.');
  const isNeg = intPart.startsWith('-');
  const digits = isNeg ? intPart.slice(1) : intPart;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const prefix = currency === 'PKR' ? 'Rs.' : currency;
  const formatted = decPart === '00' ? `${prefix} ${withCommas}` : `${prefix} ${withCommas}.${decPart}`;
  return isNeg ? `-${formatted}` : formatted;
}

export function formatQuantity(value: DecimalInput): string {
  const d = dec(value).toDecimalPlaces(3, ExactDecimal.ROUND_HALF_UP);
  const fixed = d.toFixed(3);
  if (fixed.endsWith('.000')) {
    return fixed.slice(0, -4);
  }
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1');
}

export function addMoney(a: DecimalInput, b: DecimalInput): string {
  return round2(dec(a).plus(dec(b)));
}

export function subMoney(a: DecimalInput, b: DecimalInput): string {
  return round2(dec(a).minus(dec(b)));
}

export function sumMoney(values: readonly DecimalInput[]): string {
  let acc = new ExactDecimal(0);
  for (const v of values) {
    acc = acc.plus(dec(v));
  }
  return round2(acc);
}

export function sumQty(values: readonly DecimalInput[]): string {
  let acc = new ExactDecimal(0);
  for (const v of values) {
    acc = acc.plus(dec(v));
  }
  return acc.toDecimalPlaces(3, ExactDecimal.ROUND_HALF_UP).toFixed(3);
}

export function cmpDecimal(a: DecimalInput, b: DecimalInput): number {
  return dec(a).comparedTo(dec(b));
}

export function maxDecimal(a: DecimalInput, b: DecimalInput): Decimal {
  const da = dec(a);
  const db = dec(b);
  return da.gte(db) ? da : db;
}

export function minDecimal(a: DecimalInput, b: DecimalInput): Decimal {
  const da = dec(a);
  const db = dec(b);
  return da.lte(db) ? da : db;
}

export function isDecimalUnit(unit: Unit): boolean {
  return DECIMAL_UNITS.includes(unit);
}

export function validateQuantityForUnit(
  qty: DecimalInput,
  unit: Unit,
  allowZero = false,
): { valid: boolean; reason?: string } {
  let d: Decimal;
  try {
    d = dec(qty);
  } catch {
    return { valid: false, reason: 'Quantity must be a valid number' };
  }

  if (allowZero ? d.lt(0) : d.lte(0)) {
    return {
      valid: false,
      reason: allowZero ? 'Quantity must be >= 0' : 'Quantity must be > 0',
    };
  }

  const decimalPlaces = d.decimalPlaces();
  if (isDecimalUnit(unit)) {
    if (decimalPlaces > 3) {
      return { valid: false, reason: `${unit} allows at most 3 decimal places` };
    }
    return { valid: true };
  }

  if (decimalPlaces > 0) {
    return { valid: false, reason: `${unit} requires a whole number quantity` };
  }
  return { valid: true };
}

// SQLite integer scaling helpers (BR-G1 / ARCHITECTURE section 11)
export function toPaisa(money: DecimalInput): number {
  return dec(round2(money)).times(100).toNumber();
}

export function fromPaisa(paisa: number): string {
  return round2(new ExactDecimal(paisa).div(100));
}

export function toThousandths(qty: DecimalInput): number {
  return dec(round3(qty)).times(1000).toNumber();
}

export function fromThousandths(thousandths: number): string {
  return formatQuantity(new ExactDecimal(thousandths).div(1000));
}

export function toCostInt(cost: DecimalInput): number {
  return dec(round4(cost)).times(10000).toNumber();
}

export function fromCostInt(costInt: number): string {
  return round4(new ExactDecimal(costInt).div(10000));
}
