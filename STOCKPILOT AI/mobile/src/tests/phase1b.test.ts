import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loginFormSchema,
  registerStep1Schema,
  shopSetupSchema,
} from '../api/authApi';
import { apiClient, setApiAuthToken } from '../api/client';
import {
  clearMemorySecureStorageForTest,
  getAuthToken,
  getOnboardingSeen,
  saveAuthToken,
  saveOnboardingSeen,
} from '../storage/secureToken';
import { useSessionStore } from '../stores/sessionStore';

describe('Phase 1b — Mobile auth forms, secure token persistence, and session guard', () => {
  beforeEach(async () => {
    clearMemorySecureStorageForTest();
    setApiAuthToken(null);
    await useSessionStore.getState().clearSession();
    useSessionStore.setState({
      hydrated: false,
      onboardingSeen: false,
      sessionExpiredMessage: null,
      registrationDraft: null,
    });
    vi.restoreAllMocks();
  });

  it('BR-A1, BR-A2, BR-A6: validates registration and shop setup schemas with PKR and Asia/Karachi defaults', () => {
    const step1Valid = registerStep1Schema.safeParse({
      ownerName: 'Ahmed Raza',
      shopName: 'Al-Madina Mobile Accessories',
      email: 'ahmed@example.com',
      password: 'Password123!',
      shopType: 'MOBILE_ACCESSORIES',
    });
    expect(step1Valid.success).toBe(true);

    const shortPassword = registerStep1Schema.safeParse({
      ownerName: 'Ahmed',
      shopName: 'Shop',
      email: 'ahmed@example.com',
      password: 'short',
      shopType: 'GROCERY',
    });
    expect(shortPassword.success).toBe(false);

    const badEmail = loginFormSchema.safeParse({
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(badEmail.success).toBe(false);

    const setupValid = shopSetupSchema.safeParse({
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      address: 'Hall Road Lahore',
    });
    expect(setupValid.success).toBe(true);
  });

  it('persists JWT and onboarding state in secure storage and restores session across app restart', async () => {
    await saveOnboardingSeen(true);
    await saveAuthToken('jwt-persisted-token');

    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'owner@shop.test',
            ownerName: 'Owner',
            phone: null,
            role: 'OWNER',
          },
          shop: {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Demo Shop',
            type: 'MOBILE_ACCESSORIES',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            address: null,
            phone: null,
          },
        },
      },
    } as never);

    expect(await getOnboardingSeen()).toBe(true);
    expect(await getAuthToken()).toBe('jwt-persisted-token');

    await useSessionStore.getState().hydrateSession();

    const state = useSessionStore.getState();
    expect(getSpy).toHaveBeenCalledWith('/auth/me');
    expect(state.hydrated).toBe(true);
    expect(state.token).toBe('jwt-persisted-token');
    expect(state.shop?.currency).toBe('PKR');
    expect(state.shop?.timezone).toBe('Asia/Karachi');
  });

  it('keeps local state and surfaces "Please log in again" when session expires (401)', async () => {
    await useSessionStore.getState().setSession({
      token: 'expired-jwt',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'owner@shop.test',
        ownerName: 'Owner',
        phone: null,
        role: 'OWNER',
      },
      shop: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Persisted Offline Shop',
        type: 'GROCERY',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        address: null,
        phone: null,
      },
    });

    await useSessionStore.getState().markSessionExpired();

    const state = useSessionStore.getState();
    expect(state.token).toBeNull();
    expect(state.sessionExpiredMessage).toBe('Please log in again');
    // Offline-first contract: local shop metadata is preserved across 401 token expiry.
    expect(state.shop?.name).toBe('Persisted Offline Shop');
    expect(await getAuthToken()).toBeNull();
  });
});
