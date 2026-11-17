import { create } from 'zustand';
import {
  allocateDiscount,
  applyDiscount,
  type DiscountInput,
  lineSubtotal,
} from '../shared/calculations';
import { DECIMAL_UNITS, type PaymentMethod, type Unit } from '../shared/enums';
import {
  cmpDecimal,
  dec,
  round2,
  sumMoney,
  validateQuantityForUnit,
} from '../shared/money';

export interface PosCartLine {
  productId: string;
  name: string;
  unit: Unit;
  defaultSellingPrice: string;
  unitPriceOverride: string | null;
  quantity: string;
  quantityOnHand: string;
}

export interface ComputedCartLine extends PosCartLine {
  effectiveUnitPrice: string;
  lineSubtotal: string;
  allocatedDiscount: string;
  lineNet: string;
  quantityValid: boolean;
  quantityError: string | null;
  exceedsStock: boolean;
}

export interface PosCartSummary {
  lines: ComputedCartLine[];
  itemCount: number;
  subtotal: string;
  discountAmount: string;
  total: string;
  discountError: string | null;
  tenderedNormalized: string;
  amountReceivedForServer: string;
  changeDue: string;
  balanceDue: string;
  paymentError: string | null;
  requiresCustomer: boolean;
  hasInvalidLine: boolean;
}

export interface PosCartSnapshot {
  items: PosCartLine[];
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: string;
  customerId: string | null;
  note: string;
  paymentMethod: PaymentMethod;
  tenderedAmount: string;
}

interface PosCartState extends PosCartSnapshot {
  addProduct: (product: {
    id: string;
    name: string;
    unit: Unit;
    sellingPrice: string;
    quantityOnHand: string;
  }) => void;
  incrementLine: (productId: string) => void;
  decrementLine: (productId: string) => void;
  setLineQuantity: (productId: string, quantity: string) => void;
  setLineUnitPrice: (productId: string, unitPrice: string | null) => void;
  removeLine: (productId: string) => void;
  setDiscount: (type: 'AMOUNT' | 'PERCENT', value: string) => void;
  clearDiscount: () => void;
  setCustomerId: (customerId: string | null) => void;
  setNote: (note: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setTenderedAmount: (amount: string) => void;
  reset: () => void;
}

const INITIAL_STATE: PosCartSnapshot = {
  items: [],
  discountType: 'AMOUNT',
  discountValue: '',
  customerId: null,
  note: '',
  paymentMethod: 'CASH',
  tenderedAmount: '',
};

export function buildDiscountInput(
  discountType: 'AMOUNT' | 'PERCENT',
  discountValue: string,
): { discount: DiscountInput | null; parseError: string | null } {
  const trimmed = discountValue.trim();
  if (!trimmed) {
    return { discount: null, parseError: null };
  }
  try {
    const d = dec(trimmed);
    if (d.lt(0)) {
      return { discount: null, parseError: 'Discount cannot be negative' };
    }
    if (d.eq(0)) {
      return { discount: null, parseError: null };
    }
    return {
      discount: { type: discountType, value: trimmed },
      parseError: null,
    };
  } catch {
    return { discount: null, parseError: 'Enter a valid discount number' };
  }
}

export function computeCartSummary(state: PosCartSnapshot): PosCartSummary {
  const rawLines = state.items.map((item) => {
    const qtyCheck = validateQuantityForUnit(item.quantity, item.unit, false);
    let priceStr = item.defaultSellingPrice;
    let priceValid = true;
    let priceError: string | null = null;

    if (item.unitPriceOverride !== null && item.unitPriceOverride.trim() !== '') {
      try {
        const p = dec(item.unitPriceOverride.trim());
        if (p.lt(0)) {
          priceValid = false;
          priceError = 'Price cannot be negative';
        } else {
          priceStr = round2(p);
        }
      } catch {
        priceValid = false;
        priceError = 'Enter a valid unit price';
      }
    }

    let computedLineSubtotal = '0.00';
    if (qtyCheck.valid && priceValid) {
      computedLineSubtotal = lineSubtotal(item.quantity.trim(), priceStr);
    }

    let exceedsStock = false;
    if (qtyCheck.valid) {
      try {
        exceedsStock = cmpDecimal(item.quantity.trim(), item.quantityOnHand) > 0;
      } catch {
        exceedsStock = false;
      }
    }

    return {
      item,
      effectiveUnitPrice: priceStr,
      lineSubtotal: computedLineSubtotal,
      quantityValid: qtyCheck.valid && priceValid,
      quantityError: priceError ?? qtyCheck.reason ?? null,
      exceedsStock,
    };
  });

  const subtotal = rawLines.length > 0 ? sumMoney(rawLines.map((l) => l.lineSubtotal)) : '0.00';

  const { discount, parseError } = buildDiscountInput(state.discountType, state.discountValue);
  let discountAmount = '0.00';
  let total = subtotal;
  let discountError = parseError;

  if (!discountError && discount) {
    try {
      const applied = applyDiscount(subtotal, discount);
      discountAmount = applied.discountAmount;
      total = applied.total;
    } catch (err) {
      discountError = err instanceof Error ? err.message : 'Invalid discount';
      discountAmount = '0.00';
      total = subtotal;
    }
  }

  let allocations = rawLines.map((l) => ({
    allocatedDiscount: '0.00',
    lineNet: l.lineSubtotal,
  }));
  if (rawLines.length > 0 && !discountError && cmpDecimal(discountAmount, 0) > 0) {
    try {
      allocations = allocateDiscount(
        rawLines.map((l) => l.lineSubtotal),
        discountAmount,
      );
    } catch {
      // Keep zero allocations when subtotal lines are incomplete
    }
  }

  const lines: ComputedCartLine[] = rawLines.map((l, idx) => ({
    ...l.item,
    effectiveUnitPrice: l.effectiveUnitPrice,
    lineSubtotal: l.lineSubtotal,
    allocatedDiscount: allocations[idx]?.allocatedDiscount ?? '0.00',
    lineNet: allocations[idx]?.lineNet ?? l.lineSubtotal,
    quantityValid: l.quantityValid,
    quantityError: l.quantityError,
    exceedsStock: l.exceedsStock,
  }));

  let tenderedNormalized = '0.00';
  let paymentError: string | null = null;
  let amountReceivedForServer = '0.00';
  let changeDue = '0.00';
  let balanceDue = total;

  if (state.paymentMethod === 'CREDIT') {
    tenderedNormalized = '0.00';
    amountReceivedForServer = '0.00';
    changeDue = '0.00';
    balanceDue = total;
  } else {
    const rawTendered = state.tenderedAmount.trim();
    if (!rawTendered) {
      // Default to exact total only when untouched? Require explicit positive amount or prefill at checkout
      paymentError = 'Enter amount received (must be greater than 0)';
    } else {
      try {
        const tenderedDec = dec(rawTendered);
        if (tenderedDec.lte(0)) {
          paymentError = 'Amount received must be greater than 0 for non-CREDIT sales';
        } else {
          tenderedNormalized = round2(tenderedDec);
          const totalDec = dec(total);
          if (tenderedDec.gt(totalDec)) {
            // BR-SA4: excess cash is shown as change and NOT stored on server
            amountReceivedForServer = total;
            changeDue = round2(tenderedDec.minus(totalDec));
            balanceDue = '0.00';
          } else {
            amountReceivedForServer = tenderedNormalized;
            changeDue = '0.00';
            balanceDue = round2(totalDec.minus(tenderedDec));
          }
        }
      } catch {
        paymentError = 'Enter a valid payment amount';
      }
    }
  }

  const requiresCustomer = cmpDecimal(balanceDue, 0) > 0 || state.paymentMethod === 'CREDIT';
  const hasInvalidLine = lines.length === 0 || lines.some((l) => !l.quantityValid);

  return {
    lines,
    itemCount: lines.length,
    subtotal,
    discountAmount,
    total,
    discountError,
    tenderedNormalized,
    amountReceivedForServer,
    changeDue,
    balanceDue,
    paymentError,
    requiresCustomer,
    hasInvalidLine,
  };
}

export const usePosCartStore = create<PosCartState>((set) => ({
  ...INITIAL_STATE,

  addProduct: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      if (existing) {
        const current = (() => {
          try {
            return dec(existing.quantity);
          } catch {
            return dec(0);
          }
        })();
        const nextQty = current.plus(1).toString();
        return {
          items: state.items.map((i) =>
            i.productId === product.id
              ? { ...i, quantity: nextQty, quantityOnHand: product.quantityOnHand }
              : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            unit: product.unit,
            defaultSellingPrice: round2(product.sellingPrice),
            unitPriceOverride: null,
            quantity: '1',
            quantityOnHand: product.quantityOnHand,
          },
        ],
      };
    }),

  incrementLine: (productId) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.productId !== productId) return i;
        try {
          return { ...i, quantity: dec(i.quantity).plus(1).toString() };
        } catch {
          return { ...i, quantity: '1' };
        }
      }),
    })),

  decrementLine: (productId) =>
    set((state) => {
      const target = state.items.find((i) => i.productId === productId);
      if (!target) return state;
      const step = DECIMAL_UNITS.includes(target.unit) ? 0.5 : 1;
      try {
        const next = dec(target.quantity).minus(step);
        if (next.lte(0)) {
          return { items: state.items.filter((i) => i.productId !== productId) };
        }
        return {
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: next.toString() } : i,
          ),
        };
      } catch {
        return { items: state.items.filter((i) => i.productId !== productId) };
      }
    }),

  setLineQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    })),

  setLineUnitPrice: (productId, unitPrice) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId
          ? {
              ...i,
              unitPriceOverride: unitPrice !== null && unitPrice.trim() !== '' ? unitPrice : null,
            }
          : i,
      ),
    })),

  removeLine: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    })),

  setDiscount: (discountType, discountValue) => set({ discountType, discountValue }),

  clearDiscount: () => set({ discountType: 'AMOUNT', discountValue: '' }),

  setCustomerId: (customerId) => set({ customerId }),

  setNote: (note) => set({ note }),

  setPaymentMethod: (paymentMethod) =>
    set((state) => ({
      paymentMethod,
      tenderedAmount: paymentMethod === 'CREDIT' ? '' : state.tenderedAmount,
    })),

  setTenderedAmount: (tenderedAmount) => set({ tenderedAmount }),

  reset: () => set({ ...INITIAL_STATE }),
}));
