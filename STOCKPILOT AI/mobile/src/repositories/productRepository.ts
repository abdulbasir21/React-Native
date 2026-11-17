import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';
import { UNITS, type Unit } from '../shared/enums';
import { validateQuantityForUnit } from '../shared/money';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductDTO {
  id: string;
  shopId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  unit: Unit;
  purchaseCost: string;
  lastPurchaseCost: string;
  sellingPrice: string;
  quantityOnHand: string;
  averageCost: string;
  minStockLevel: string;
  isLowStock: boolean;
  imageUri: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const decimalInputSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative number');

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required').max(150),
    categoryId: z.string().uuid().nullable().optional(),
    sku: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
    unit: z.enum(UNITS),
    purchaseCost: decimalInputSchema,
    sellingPrice: decimalInputSchema,
    initialQuantity: decimalInputSchema.optional().default('0'),
    minStockLevel: decimalInputSchema.optional().default('0'),
  })
  .superRefine((val, ctx) => {
    const minCheck = validateQuantityForUnit(val.minStockLevel || '0', val.unit, true);
    if (!minCheck.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minStockLevel'],
        message: minCheck.reason ?? 'Invalid quantity for unit',
      });
    }
    const initCheck = validateQuantityForUnit(val.initialQuantity || '0', val.unit, true);
    if (!initCheck.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialQuantity'],
        message: initCheck.reason ?? 'Invalid quantity for unit',
      });
    }
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const productRepository = {
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    categoryId?: string;
    includeArchived?: boolean;
    lowStockOnly?: boolean;
  }): Promise<{ items: ProductDTO[]; meta?: PaginationMeta }> {
    const query: Record<string, string | number> = {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.categoryId) query.categoryId = params.categoryId;
    if (params?.includeArchived !== undefined) {
      query.includeArchived = params.includeArchived ? 'true' : 'false';
    }
    if (params?.lowStockOnly !== undefined) {
      query.lowStockOnly = params.lowStockOnly ? 'true' : 'false';
    }

    const res = await apiClient.get<ApiSuccessResponse<ProductDTO[], PaginationMeta>>('/products', {
      params: query,
    });
    return { items: res.data.data, meta: res.data.meta };
  },

  async getById(id: string): Promise<ProductDTO> {
    const res = await apiClient.get<ApiSuccessResponse<ProductDTO>>(`/products/${id}`);
    return res.data.data;
  },

  async create(input: ProductFormValues & { id?: string }): Promise<ProductDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<ProductDTO>>('/products', {
      id,
      categoryId: input.categoryId ?? null,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      description: input.description?.trim() || null,
      unit: input.unit,
      purchaseCost: input.purchaseCost.trim(),
      sellingPrice: input.sellingPrice.trim(),
      initialQuantity: input.initialQuantity?.trim() || '0',
      minStockLevel: input.minStockLevel?.trim() || '0',
    });
    return res.data.data;
  },

  async update(
    id: string,
    input: Partial<Omit<ProductFormValues, 'initialQuantity'>>,
  ): Promise<ProductDTO> {
    const res = await apiClient.patch<ApiSuccessResponse<ProductDTO>>(`/products/${id}`, {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.purchaseCost !== undefined ? { purchaseCost: input.purchaseCost.trim() } : {}),
      ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice.trim() } : {}),
      ...(input.minStockLevel !== undefined ? { minStockLevel: input.minStockLevel.trim() } : {}),
    });
    return res.data.data;
  },

  async archive(id: string): Promise<ProductDTO> {
    const res = await apiClient.post<ApiSuccessResponse<ProductDTO>>(`/products/${id}/archive`);
    return res.data.data;
  },
};
