export const PAYMENT_METHODS = [
  'CASH',
  'EASYPAISA',
  'JAZZCASH',
  'BANK_TRANSFER',
  'CARD',
  'CREDIT',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const NON_CREDIT_PAYMENT_METHODS = [
  'CASH',
  'EASYPAISA',
  'JAZZCASH',
  'BANK_TRANSFER',
  'CARD',
] as const;
export type NonCreditPaymentMethod = (typeof NON_CREDIT_PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'PAID',
  'PARTIAL',
  'UNPAID',
  'NOT_APPLICABLE',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SALE_STATUSES = ['COMPLETED', 'CANCELLED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'INITIAL_STOCK',
  'PURCHASE',
  'SALE',
  'CUSTOMER_RETURN',
  'DAMAGED',
  'EXPIRED',
  'ADJUSTMENT',
  'SALE_CANCELLATION',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const PAYMENT_KINDS = [
  'SALE_PAYMENT',
  'SALE_REFUND',
  'PURCHASE_PAYMENT',
] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_DIRECTIONS = ['IN', 'OUT'] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const EXPENSE_CATEGORIES = [
  'RENT',
  'ELECTRICITY',
  'INTERNET',
  'SALARIES',
  'TRANSPORT',
  'MAINTENANCE',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const UNITS = [
  'PIECE',
  'PACK',
  'DOZEN',
  'BOX',
  'KG',
  'LITRE',
  'METRE',
] as const;
export type Unit = (typeof UNITS)[number];

export const DECIMAL_UNITS: readonly Unit[] = ['KG', 'LITRE', 'METRE'] as const;

export const SHOP_TYPES = [
  'GROCERY',
  'MOBILE_ACCESSORIES',
  'ELECTRONICS',
  'GENERAL_RETAIL',
  'OTHER',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export const AI_ACTION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'EXECUTED',
  'REJECTED',
  'EXPIRED',
  'FAILED',
] as const;
export type AIActionStatus = (typeof AI_ACTION_STATUSES)[number];
