import { z } from 'zod';
import { SHOP_TYPES, type ShopType } from '../shared/enums';
import { apiClient, type ApiSuccessResponse } from './client';
import type { SessionShop, SessionUser } from '../stores/sessionStore';

export const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  MOBILE_ACCESSORIES: 'Mobile accessories',
  GROCERY: 'Grocery',
  ELECTRONICS: 'Electronics',
  GENERAL_RETAIL: 'General retail',
  OTHER: 'Other',
};

export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerStep1Schema = z.object({
  ownerName: z.string().trim().min(1, 'Owner name is required').max(120),
  shopName: z.string().trim().min(1, 'Shop name is required').max(150),
  email: z.string().trim().email('Enter a valid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  phone: z.string().trim().max(40).optional(),
  shopType: z.enum(SHOP_TYPES),
});
export type RegisterStep1Values = z.infer<typeof registerStep1Schema>;

export const shopSetupSchema = z.object({
  currency: z.string().trim().min(3, 'Currency code required').max(10),
  timezone: z.string().trim().min(1, 'Timezone is required').max(64),
  address: z.string().trim().max(300).optional(),
});
export type ShopSetupValues = z.infer<typeof shopSetupSchema>;

export interface RegisterRequestPayload {
  ownerName: string;
  shopName: string;
  email: string;
  password: string;
  shopType: ShopType;
  currency?: string;
  timezone?: string;
  phone?: string | null;
  address?: string | null;
}

export interface AuthPayload {
  token: string;
  user: SessionUser;
  shop: SessionShop;
}

export async function registerApi(payload: RegisterRequestPayload): Promise<AuthPayload> {
  const res = await apiClient.post<ApiSuccessResponse<AuthPayload>>('/auth/register', payload);
  return res.data.data;
}

export async function loginApi(payload: LoginFormValues): Promise<AuthPayload> {
  const res = await apiClient.post<ApiSuccessResponse<AuthPayload>>('/auth/login', payload);
  return res.data.data;
}

export async function fetchMeApi(): Promise<{ user: SessionUser; shop: SessionShop }> {
  const res = await apiClient.get<ApiSuccessResponse<{ user: SessionUser; shop: SessionShop }>>(
    '/auth/me',
  );
  return res.data.data;
}

export async function getShopApi(): Promise<SessionShop> {
  const res = await apiClient.get<ApiSuccessResponse<SessionShop>>('/shop');
  return res.data.data;
}

export async function updateShopApi(payload: {
  name?: string;
  type?: ShopType;
  currency?: string;
  timezone?: string;
  address?: string | null;
  phone?: string | null;
}): Promise<SessionShop> {
  const res = await apiClient.patch<ApiSuccessResponse<SessionShop>>('/shop', payload);
  return res.data.data;
}
