import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import type { NonCreditPaymentMethod } from '../shared/enums';
import type { PaginationMeta } from './productRepository';
import type { PaymentDTO } from './purchaseRepository';
import type { SaleDTO } from './saleRepository';

export interface CustomerDTO {
  id: string;
  shopId: string;
  name: string;
  phone: string | null;
  outstandingBalance: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(150),
  phone: z.string().trim().max(40).optional(),
});
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const customerRepository = {
  async list(params?: { page?: number; pageSize?: number; search?: string; includeArchived?: boolean }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.includeArchived !== undefined) {
      query.includeArchived = params.includeArchived ? 'true' : 'false';
    }
    const res = await apiClient.get<ApiSuccessResponse<CustomerDTO[], PaginationMeta>>('/customers', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<CustomerDTO> {
    const res = await apiClient.get<ApiSuccessResponse<CustomerDTO>>(`/customers/${id}`);
    return res.data.data;
  },

  async create(input: CustomerFormValues & { id?: string }): Promise<CustomerDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<CustomerDTO>>('/customers', {
      id,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
    });
    return res.data.data;
  },

  async update(id: string, input: CustomerFormValues): Promise<CustomerDTO> {
    const res = await apiClient.patch<ApiSuccessResponse<CustomerDTO>>(`/customers/${id}`, {
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
    });
    return res.data.data;
  },

  async archive(id: string): Promise<CustomerDTO> {
    const res = await apiClient.post<ApiSuccessResponse<CustomerDTO>>(`/customers/${id}/archive`);
    return res.data.data;
  },

  async receivePayment(
    customerId: string,
    input: { amount: string; method: NonCreditPaymentMethod; note?: string; allocationCount?: number },
  ): Promise<{
    customerId: string;
    amountApplied: string;
    outstandingBefore: string;
    outstandingAfter: string;
    allocations: Array<{ saleId: string; receiptNo: string; amount: string }>;
    payments: PaymentDTO[];
  }> {
    const res = await apiClient.post<
      ApiSuccessResponse<{
        customerId: string;
        amountApplied: string;
        outstandingBefore: string;
        outstandingAfter: string;
        allocations: Array<{ saleId: string; receiptNo: string; amount: string }>;
        payments: PaymentDTO[];
      }>
    >(`/customers/${customerId}/receive-payment`, {
      amount: input.amount.trim(),
      method: input.method,
      note: input.note?.trim() || null,
      ...(input.allocationCount && input.allocationCount > 0
        ? {
            paymentIds: Array.from({ length: input.allocationCount }, () => generateClientId()),
          }
        : {}),
    });
    return res.data.data;
  },

  async listSales(customerId: string): Promise<SaleDTO[]> {
    const res = await apiClient.get<ApiSuccessResponse<SaleDTO[]>>(`/customers/${customerId}/sales`);
    return res.data.data;
  },

  async listPayments(customerId: string): Promise<PaymentDTO[]> {
    const res = await apiClient.get<ApiSuccessResponse<PaymentDTO[]>>(
      `/customers/${customerId}/payments`,
    );
    return res.data.data;
  },
};
