import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import { NON_CREDIT_PAYMENT_METHODS, type NonCreditPaymentMethod } from '../shared/enums';
import { dec } from '../shared/money';
import type { PaginationMeta } from './productRepository';
import type { PaymentDTO, PurchaseDTO } from './purchaseRepository';

export interface SupplierDTO {
  id: string;
  shopId: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payableBalance: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentResult {
  supplierId: string;
  amountPaid: string;
  payableBalanceAfter: string;
  allocations: Array<{ targetId: string; amount: string }>;
  payments: PaymentDTO[];
}

export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(150),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const paySupplierSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Enter a positive amount')
    .refine((v) => dec(v).gt(0), 'Amount must be greater than zero'),
  method: z.enum(NON_CREDIT_PAYMENT_METHODS),
  note: z.string().trim().max(300).optional(),
});
export type PaySupplierValues = z.infer<typeof paySupplierSchema>;

export const supplierRepository = {
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    includeArchived?: boolean;
  }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.includeArchived !== undefined) {
      query.includeArchived = params.includeArchived ? 'true' : 'false';
    }
    const res = await apiClient.get<ApiSuccessResponse<SupplierDTO[], PaginationMeta>>('/suppliers', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<SupplierDTO> {
    const res = await apiClient.get<ApiSuccessResponse<SupplierDTO>>(`/suppliers/${id}`);
    return res.data.data;
  },

  async create(input: SupplierFormValues & { id?: string }): Promise<SupplierDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<SupplierDTO>>('/suppliers', {
      id,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    });
    return res.data.data;
  },

  async update(id: string, input: SupplierFormValues): Promise<SupplierDTO> {
    const res = await apiClient.patch<ApiSuccessResponse<SupplierDTO>>(`/suppliers/${id}`, {
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    });
    return res.data.data;
  },

  async archive(id: string): Promise<SupplierDTO> {
    const res = await apiClient.post<ApiSuccessResponse<SupplierDTO>>(`/suppliers/${id}/archive`);
    return res.data.data;
  },

  async pay(
    supplierId: string,
    input: {
      amount: string;
      method: NonCreditPaymentMethod;
      note?: string;
      purchaseId?: string;
    },
  ): Promise<SupplierPaymentResult> {
    const res = await apiClient.post<ApiSuccessResponse<SupplierPaymentResult>>(
      `/suppliers/${supplierId}/pay`,
      {
        amount: input.amount.trim(),
        method: input.method,
        note: input.note?.trim() || null,
        ...(input.purchaseId ? { purchaseId: input.purchaseId } : {}),
        paymentIds: [generateClientId()],
      },
    );
    return res.data.data;
  },

  async listPayments(supplierId: string, page = 1, pageSize = 50) {
    const res = await apiClient.get<ApiSuccessResponse<PaymentDTO[], PaginationMeta>>(
      `/suppliers/${supplierId}/payments`,
      { params: { page, pageSize } },
    );
    return { items: res.data.data, meta: res.data.meta };
  },

  async listPurchases(supplierId: string, page = 1, pageSize = 50) {
    const res = await apiClient.get<ApiSuccessResponse<PurchaseDTO[], PaginationMeta>>(
      `/suppliers/${supplierId}/purchases`,
      { params: { page, pageSize } },
    );
    return { items: res.data.data, meta: res.data.meta };
  },
};
