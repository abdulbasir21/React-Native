import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import type { ReportPeriod } from '../shared/calculations';
import {
  EXPENSE_CATEGORIES,
  NON_CREDIT_PAYMENT_METHODS,
  type ExpenseCategory,
  type NonCreditPaymentMethod,
} from '../shared/enums';
import { dec } from '../shared/money';
import type { PaginationMeta } from './productRepository';

export interface ExpenseDTO {
  id: string;
  shopId: string;
  title: string;
  category: ExpenseCategory;
  amount: string;
  expenseDate: string;
  paymentMethod: NonCreditPaymentMethod;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseListMeta extends PaginationMeta {
  totalAmount: string;
}

export const expenseFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Enter a valid amount')
    .refine((v) => dec(v).gt(0), 'Expense amount must be greater than zero'),
  expenseDate: z.string().trim().min(1, 'Date is required'),
  paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS),
  description: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(300).optional(),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const expenseRepository = {
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: ExpenseCategory;
    period?: ReportPeriod;
  }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.category) query.category = params.category;
    if (params?.period) query.period = params.period;

    const res = await apiClient.get<ApiSuccessResponse<ExpenseDTO[], ExpenseListMeta>>('/expenses', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<ExpenseDTO> {
    const res = await apiClient.get<ApiSuccessResponse<ExpenseDTO>>(`/expenses/${id}`);
    return res.data.data;
  },

  async create(input: ExpenseFormValues & { id?: string }): Promise<ExpenseDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<ExpenseDTO>>('/expenses', {
      id,
      title: input.title.trim(),
      category: input.category,
      amount: input.amount.trim(),
      expenseDate: input.expenseDate,
      paymentMethod: input.paymentMethod,
      description: input.description?.trim() || null,
    });
    return res.data.data;
  },

  async update(id: string, input: ExpenseFormValues): Promise<ExpenseDTO> {
    const res = await apiClient.patch<ApiSuccessResponse<ExpenseDTO>>(`/expenses/${id}`, {
      title: input.title.trim(),
      category: input.category,
      amount: input.amount.trim(),
      expenseDate: input.expenseDate,
      paymentMethod: input.paymentMethod,
      description: input.description?.trim() || null,
      reason: input.reason?.trim() || null,
    });
    return res.data.data;
  },
};
