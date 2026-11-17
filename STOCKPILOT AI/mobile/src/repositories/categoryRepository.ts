import { apiClient, type ApiSuccessResponse } from '../api/client';
import { generateClientId } from '../lib/ids';

export interface CategoryDTO {
  id: string;
  shopId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const categoryRepository = {
  async list(): Promise<CategoryDTO[]> {
    const res = await apiClient.get<ApiSuccessResponse<CategoryDTO[]>>('/categories');
    return res.data.data;
  },

  async create(input: { id?: string; name: string }): Promise<CategoryDTO> {
    const id = input.id ?? generateClientId();
    const res = await apiClient.post<ApiSuccessResponse<CategoryDTO>>('/categories', {
      id,
      name: input.name,
    });
    return res.data.data;
  },

  async update(id: string, input: { name: string }): Promise<CategoryDTO> {
    const res = await apiClient.patch<ApiSuccessResponse<CategoryDTO>>(`/categories/${id}`, input);
    return res.data.data;
  },
};
