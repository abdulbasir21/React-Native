import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import type { ReportPeriod } from '../shared/calculations';
import type {
  NonCreditPaymentMethod,
  PaymentDirection,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
} from '../shared/enums';
import type { PaginationMeta } from './productRepository';

export interface PaymentDTO {
  id: string;
  shopId: string;
  kind: PaymentKind;
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: string;
  paidAt: string;
  saleId: string | null;
  purchaseId: string | null;
  note: string | null;
  createdAt: string;
}

export interface PurchaseItemDTO {
  id: string;
  purchaseId: string;
  productId: string;
  productNameSnapshot: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
  createdAt: string;
}

export interface PurchaseDTO {
  id: string;
  shopId: string;
  supplierId: string;
  supplierName?: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  paymentStatus: PaymentStatus;
  idempotencyKey: string;
  occurredAt: string;
  note: string | null;
  createdAt: string;
  items?: PurchaseItemDTO[];
  payments: PaymentDTO[];
}

export const purchaseRepository = {
  async list(params?: {
    page?: number;
    pageSize?: number;
    supplierId?: string;
    search?: string;
    period?: ReportPeriod;
  }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.supplierId) query.supplierId = params.supplierId;
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.period) query.period = params.period;

    const res = await apiClient.get<ApiSuccessResponse<PurchaseDTO[], PaginationMeta>>('/purchases', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<PurchaseDTO> {
    const res = await apiClient.get<ApiSuccessResponse<PurchaseDTO>>(`/purchases/${id}`);
    return res.data.data;
  },

  async create(input: {
    id?: string;
    idempotencyKey?: string;
    supplierId: string;
    occurredAt?: string;
    note?: string;
    amountPaid?: string;
    paymentMethod?: NonCreditPaymentMethod;
    items: Array<{ productId: string; quantity: string; unitCost: string }>;
  }): Promise<PurchaseDTO> {
    const id = input.id ?? generateClientId();
    const idempotencyKey = input.idempotencyKey ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<PurchaseDTO>>(
      '/purchases',
      {
        id,
        idempotencyKey,
        supplierId: input.supplierId,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        note: input.note?.trim() || null,
        amountPaid: input.amountPaid?.trim() || '0.00',
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        ...(input.amountPaid && Number(input.amountPaid) > 0 ? { paymentId: generateClientId() } : {}),
        items: input.items.map((item) => ({
          id: generateClientId(),
          movementId: generateClientId(),
          productId: item.productId,
          quantity: item.quantity.trim(),
          unitCost: item.unitCost.trim(),
        })),
      },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return res.data.data;
  },

  async payPurchase(
    purchaseId: string,
    input: { amount: string; method: NonCreditPaymentMethod; note?: string },
  ) {
    const res = await apiClient.post<ApiSuccessResponse<{ payableBalanceAfter: string }>>(
      `/purchases/${purchaseId}/payments`,
      {
        amount: input.amount.trim(),
        method: input.method,
        note: input.note?.trim() || null,
        paymentId: generateClientId(),
      },
    );
    return res.data.data;
  },
};
