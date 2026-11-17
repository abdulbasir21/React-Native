import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import type { DiscountInput, ReportPeriod } from '../shared/calculations';
import type {
  NonCreditPaymentMethod,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  Unit,
} from '../shared/enums';
import { cmpDecimal, round2 } from '../shared/money';
import type { PaginationMeta } from './productRepository';
import type { PaymentDTO } from './purchaseRepository';

export interface SaleItemDTO {
  id: string;
  saleId: string;
  productId: string;
  productNameSnapshot: string;
  unitSnapshot: Unit;
  quantity: string;
  returnedQuantity?: string;
  unitPrice: string;
  lineSubtotal: string;
  allocatedDiscount: string;
  lineNet: string;
  unitCostSnapshot: string;
  lineCogs: string;
  createdAt: string;
}

export interface SaleReturnItemDTO {
  id: string;
  saleItemId: string;
  quantity: string;
  refundValue: string;
  cogsReversed: string;
}

export interface SaleReturnDTO {
  id: string;
  saleId: string;
  reason: string;
  occurredAt: string;
  createdAt: string;
  items: SaleReturnItemDTO[];
}

export interface SaleCustomerSummaryDTO {
  id: string;
  name: string;
  phone: string | null;
  archivedAt: string | null;
}

export interface SaleDTO {
  id: string;
  shopId: string;
  customerId: string | null;
  customer: SaleCustomerSummaryDTO | null;
  receiptNo: string;
  status: SaleStatus;
  subtotal: string;
  discountAmount: string;
  total: string;
  returnedValue: string;
  netTotal: string;
  amountPaid: string;
  balanceDue: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  idempotencyKey: string;
  occurredAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  note: string | null;
  warnings: string[];
  createdAt: string;
  items?: SaleItemDTO[];
  returns?: SaleReturnDTO[];
  payments: PaymentDTO[];
}

export interface ReceiptShopDTO {
  id: string;
  name: string;
  type: string;
  currency: string;
  timezone: string;
  address: string | null;
  phone: string | null;
}

export interface ReceiptDataDTO {
  shop: ReceiptShopDTO;
  sale: SaleDTO;
}

export interface CreateSaleRequestInput {
  id?: string;
  idempotencyKey?: string;
  customerId?: string | null;
  occurredAt?: string;
  note?: string | null;
  discount?: DiscountInput | null;
  paymentMethod: PaymentMethod;
  amountReceived: string;
  items: Array<{
    productId: string;
    quantity: string;
    unitPrice?: string | null;
  }>;
}

export const saleRepository = {
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: SaleStatus;
    paymentStatus?: PaymentStatus;
    customerId?: string;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.status) query.status = params.status;
    if (params?.paymentStatus) query.paymentStatus = params.paymentStatus;
    if (params?.customerId) query.customerId = params.customerId;
    if (params?.period) query.period = params.period;
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;

    const res = await apiClient.get<ApiSuccessResponse<SaleDTO[], PaginationMeta>>('/sales', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<SaleDTO> {
    const res = await apiClient.get<ApiSuccessResponse<SaleDTO>>(`/sales/${id}`);
    return res.data.data;
  },

  async getReceipt(id: string): Promise<ReceiptDataDTO> {
    const res = await apiClient.get<ApiSuccessResponse<ReceiptDataDTO>>(`/sales/${id}/receipt`);
    return res.data.data;
  },

  async create(input: CreateSaleRequestInput): Promise<SaleDTO> {
    const id = input.id ?? generateClientId();
    const idempotencyKey = input.idempotencyKey ?? generateClientId();
    const normalizedReceived =
      input.paymentMethod === 'CREDIT' ? '0.00' : round2(input.amountReceived || '0');
    const hasPayment = input.paymentMethod !== 'CREDIT' && cmpDecimal(normalizedReceived, 0) > 0;

    const payload = {
      id,
      idempotencyKey,
      customerId: input.customerId ?? null,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      note: input.note?.trim() || null,
      discount: input.discount ?? null,
      paymentMethod: input.paymentMethod,
      amountReceived: normalizedReceived,
      ...(hasPayment ? { paymentId: generateClientId() } : {}),
      items: input.items.map((item) => ({
        id: generateClientId(),
        movementId: generateClientId(),
        productId: item.productId,
        quantity: item.quantity.trim(),
        ...(item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice.trim() !== ''
          ? { unitPrice: round2(item.unitPrice.trim()) }
          : {}),
      })),
    };

    const res = await apiClient.post<ApiSuccessResponse<SaleDTO>>('/sales', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return res.data.data;
  },

  async addPayment(
    saleId: string,
    input: { amount: string; method: NonCreditPaymentMethod; paidAt?: string; note?: string | null },
  ): Promise<SaleDTO> {
    const res = await apiClient.post<ApiSuccessResponse<SaleDTO>>(`/sales/${saleId}/payments`, {
      id: generateClientId(),
      amount: round2(input.amount.trim()),
      method: input.method,
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
      note: input.note?.trim() || null,
    });
    return res.data.data;
  },

  async createReturn(
    saleId: string,
    input: {
      reason: string;
      refundMethod?: NonCreditPaymentMethod | null;
      items: Array<{ saleItemId: string; quantity: string }>;
    },
  ): Promise<{ saleReturnId: string; returnedValue: string; refundPaymentAmount: string; sale: SaleDTO }> {
    const res = await apiClient.post<
      ApiSuccessResponse<{
        saleReturnId: string;
        returnedValue: string;
        refundPaymentAmount: string;
        sale: SaleDTO;
      }>
    >(`/sales/${saleId}/returns`, {
      id: generateClientId(),
      reason: input.reason.trim(),
      ...(input.refundMethod ? { refundMethod: input.refundMethod } : {}),
      items: input.items.map((item) => ({
        id: generateClientId(),
        movementId: generateClientId(),
        saleItemId: item.saleItemId,
        quantity: item.quantity.trim(),
      })),
    });
    return res.data.data;
  },

  async cancel(
    saleId: string,
    input: { reason: string; refundMethod?: NonCreditPaymentMethod | null },
  ): Promise<SaleDTO> {
    const res = await apiClient.post<ApiSuccessResponse<SaleDTO>>(`/sales/${saleId}/cancel`, {
      reason: input.reason.trim(),
      ...(input.refundMethod ? { refundMethod: input.refundMethod } : {}),
      paymentId: generateClientId(),
    });
    return res.data.data;
  },
};
