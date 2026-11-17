import axios from 'axios';
import { create } from 'zustand';
import { fetchMeApi, type RegisterStep1Values } from '../api/authApi';
import { setApiAuthToken, setOnUnauthorized } from '../api/client';
import {
  deleteAuthToken,
  getAuthToken,
  getOnboardingSeen,
  saveAuthToken,
  saveOnboardingSeen,
} from '../storage/secureToken';

export interface SessionUser {
  id: string;
  shopId?: string;
  email: string;
  ownerName: string;
  phone: string | null;
  role: 'OWNER';
}

export interface SessionShop {
  id: string;
  name: string;
  type: string;
  currency: string;
  timezone: string;
  address: string | null;
  phone: string | null;
}

export interface SessionState {
  token: string | null;
  user: SessionUser | null;
  shop: SessionShop | null;
  hydrated: boolean;
  onboardingSeen: boolean;
  sessionExpiredMessage: string | null;
  registrationDraft: RegisterStep1Values | null;
  setSession: (payload: { token: string; user: SessionUser; shop: SessionShop }) => Promise<void>;
  updateShop: (shop: SessionShop) => void;
  setHydrated: (hydrated: boolean) => void;
  setOnboardingSeen: (seen: boolean) => Promise<void>;
  setRegistrationDraft: (draft: RegisterStep1Values | null) => void;
  markSessionExpired: () => Promise<void>;
  clearSession: () => Promise<void>;
  hydrateSession: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => {
  setOnUnauthorized(() => {
    void get().markSessionExpired();
  });

  return {
    token: null,
    user: null,
    shop: null,
    hydrated: false,
    onboardingSeen: false,
    sessionExpiredMessage: null,
    registrationDraft: null,

    setSession: async ({ token, user, shop }) => {
      setApiAuthToken(token);
      set({
        token,
        user,
        shop,
        sessionExpiredMessage: null,
        registrationDraft: null,
        hydrated: true,
      });
      await saveAuthToken(token);
    },

    updateShop: (shop) => set({ shop }),

    setHydrated: (hydrated) => set({ hydrated }),

    setOnboardingSeen: async (seen) => {
      set({ onboardingSeen: seen });
      await saveOnboardingSeen(seen);
    },

    setRegistrationDraft: (draft) => set({ registrationDraft: draft }),

    markSessionExpired: async () => {
      setApiAuthToken(null);
      set({
        token: null,
        sessionExpiredMessage: 'Please log in again',
      });
      await deleteAuthToken();
    },

    clearSession: async () => {
      setApiAuthToken(null);
      set({
        token: null,
        user: null,
        shop: null,
        sessionExpiredMessage: null,
      });
      await deleteAuthToken();
    },

    hydrateSession: async () => {
      try {
        const [seen, storedToken] = await Promise.all([getOnboardingSeen(), getAuthToken()]);
        if (!storedToken) {
          setApiAuthToken(null);
          set({ token: null, onboardingSeen: seen, hydrated: true });
          return;
        }

        setApiAuthToken(storedToken);
        try {
          const me = await fetchMeApi();
          set({
            token: storedToken,
            user: me.user,
            shop: me.shop,
            onboardingSeen: true,
            sessionExpiredMessage: null,
            hydrated: true,
          });
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 401) {
            await deleteAuthToken();
            setApiAuthToken(null);
            set({
              token: null,
              onboardingSeen: true,
              sessionExpiredMessage: 'Please log in again',
              hydrated: true,
            });
            return;
          }
          // Offline or temporary network error: preserve token so offline operations remain accessible.
          set({
            token: storedToken,
            onboardingSeen: seen,
            hydrated: true,
          });
        }
      } catch {
        set({ hydrated: true });
      }
    },
  };
});
