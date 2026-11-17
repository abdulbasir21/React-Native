import { z } from 'zod';
import { apiClient, type ApiSuccessResponse } from '../api/client';
import { SHOP_TYPES, type ShopType } from '../shared/enums';
import type { SessionShop } from '../stores/sessionStore';

export const shopSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Shop name is required').max(150),
  type: z.enum(SHOP_TYPES),
  currency: z.string().trim().min(3, 'Currency code must be at least 3 chars').max(10),
  timezone: z.string().trim().min(1, 'Timezone is required').max(64),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});
export type ShopSettingsValues = z.infer<typeof shopSettingsSchema>;

export const shopRepository = {
  async get(): Promise<SessionShop> {
    const res = await apiClient.get<ApiSuccessResponse<SessionShop>>('/shop');
    return res.data.data;
  },

  async update(input: {
    name?: string;
    type?: ShopType;
    currency?: string;
    timezone?: string;
    address?: string | null;
    phone?: string | null;
  }): Promise<SessionShop> {
    const res = await apiClient.patch<ApiSuccessResponse<SessionShop>>('/shop', input);
    return res.data.data;
  },
};
