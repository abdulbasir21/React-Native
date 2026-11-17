import { describe, expect, it, vi } from 'vitest';
import { apiClient, fetchHealth, getApiBaseUrl, setApiAuthToken } from '../api/client';
import { useSessionStore } from '../stores/sessionStore';
import { colors, layout, paymentStatusColors, radii, spacing } from '../theme/tokens';

describe('Phase 0 — Mobile tokens, Axios health client, and Zustand session store', () => {
  it('exposes design tokens matching docs/design-tokens.md', () => {
    expect(colors.primary).toBe('#0B6E5C');
    expect(colors.background).toBe('#F7F8F6');
    expect(colors.surface).toBe('#FFFFFF');
    expect(layout.minTouchTarget).toBeGreaterThanOrEqual(44);
    expect(spacing.screenPadding).toBe(16);
    expect(radii.md).toBe(12);
    expect(paymentStatusColors.PAID.text).toBe('#027A48');
  });

  it('uses EXPO_PUBLIC_API_URL when set and defaults cleanly', () => {
    const original = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:4000/api/v1/';
    expect(getApiBaseUrl()).toBe('http://10.0.2.2:4000/api/v1');
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = original;
    }
  });

  it('calls GET /health via apiClient and parses standard envelope', async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, data: { status: 'ok', service: 'stockpilot-api' } },
    });
    const res = await fetchHealth();
    expect(spy).toHaveBeenCalledWith('/health');
    expect(res).toEqual({ status: 'ok', service: 'stockpilot-api' });
    spy.mockRestore();
  });

  it('updates and clears session store cleanly', () => {
    const store = useSessionStore.getState();
    store.setSession({
      token: 'jwt-token',
      user: {
        id: 'u1',
        email: 'owner@example.com',
        ownerName: 'Owner',
        phone: null,
        role: 'OWNER',
      },
      shop: {
        id: 's1',
        name: 'Test Shop',
        type: 'GENERAL_RETAIL',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        address: null,
        phone: null,
      },
    });
    expect(useSessionStore.getState().token).toBe('jwt-token');
    store.markSessionExpired();
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().sessionExpiredMessage).toBe('Please log in again');
    store.clearSession();
    setApiAuthToken(null);
    expect(useSessionStore.getState().user).toBeNull();
  });
});
