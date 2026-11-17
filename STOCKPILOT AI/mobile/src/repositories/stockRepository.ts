import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import type { StockMovementType, Unit } from '../shared/enums';
import { cmpDecimal, validateQuantityForUnit } from '../shared/money';
import type { PaginationMeta } from './productRepository';

export interface StockMovementDTO {
  id: string;
  shopId: string;
  productId: string;
  productName?: string;
  productUnit?: Unit;
  type: StockMovementType;
  quantityChange: string;
  previousQty: string;
  newQty: string;
  saleId: string | null;
  purchaseId: string | null;
  saleReturnId: string | null;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

export function createAdjustStockSchema(unit: Unit) {
  return z
    .object({
      type: z.enum(['ADJUSTMENT', 'DAMAGED', 'EXPIRED']),
      quantityChange: z
        .string()
        .trim()
        .regex(/^-?\d+(\.\d+)?$/, 'Enter a valid non-zero quantity'),
      reason: z.string().trim().min(1, 'Reason is required').max(300),
    })
    .superRefine((val, ctx) => {
      if (cmpDecimal(val.quantityChange, 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityChange'],
          message: 'Quantity change cannot be zero',
        });
        return;
      }
      if ((val.type === 'DAMAGED' || val.type === 'EXPIRED') && cmpDecimal(val.quantityChange, 0) > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityChange'],
          message: `${val.type} movement must be negative`,
        });
        return;
      }
      const absQty = val.quantityChange.startsWith('-')
        ? val.quantityChange.slice(1)
        : val.quantityChange;
      const check = validateQuantityForUnit(absQty, unit);
      if (!check.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityChange'],
          message: check.reason ?? 'Invalid quantity for unit',
        });
      }
    });
}

export const stockRepository = {
  async listByProduct(productId: string, page = 1, pageSize = 30) {
    const res = await apiClient.get<ApiSuccessResponse<StockMovementDTO[], PaginationMeta>>(
      `/products/${productId}/movements`,
      { params: { page, pageSize } },
    );
    return { items: res.data.data, meta: res.data.meta };
  },

  async listAll(params?: {
    page?: number;
    pageSize?: number;
    productId?: string;
    type?: StockMovementType;
  }) {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.productId) query.productId = params.productId;
    if (params?.type) query.type = params.type;

    const res = await apiClient.get<ApiSuccessResponse<StockMovementDTO[], PaginationMeta>>(
      '/stock-movements',
      { params: query },
    );
    return { items: res.data.data, meta: res.data.meta };
  },

  async adjustStock(
    productId: string,
    input: {
      id?: string;
      type: 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED';
      quantityChange: string;
      reason: string;
    },
  ): Promise<StockMovementDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<StockMovementDTO>>(
      `/products/${productId}/adjust-stock`,
      {
        id,
        type: input.type,
        quantityChange: input.quantityChange.trim(),
        reason: input.reason.trim(),
      },
    );
    return res.data.data;
  },
};
