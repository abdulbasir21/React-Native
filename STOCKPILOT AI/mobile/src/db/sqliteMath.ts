import { dec, round2, round3, round4 } from '../shared/money';

export function moneyToInt(value: string | number): number {
  const scaled = dec(round2(value)).times(100);
  return Number(scaled.toFixed(0));
}

export function intToMoney(minor: number): string {
  return round2(dec(minor).div(100));
}

export function qtyToMilli(value: string | number): number {
  const scaled = dec(round3(value)).times(1000);
  return Number(scaled.toFixed(0));
}

export function milliToQty(milli: number): string {
  return round3(dec(milli).div(1000));
}

export function costToMicro(value: string | number): number {
  const scaled = dec(round4(value)).times(10000);
  return Number(scaled.toFixed(0));
}

export function microToCost(micro: number): string {
  return round4(dec(micro).div(10000));
}
