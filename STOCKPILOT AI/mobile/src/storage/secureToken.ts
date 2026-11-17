import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'stockpilot_auth_token';
const ONBOARDING_KEY = 'stockpilot_onboarding_seen';

export interface SecureStorageBackend {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

const memoryFallback = new Map<string, string>();

const memoryStorageBackend: SecureStorageBackend = {
  async getItemAsync(key: string) {
    return memoryFallback.get(key) ?? null;
  },
  async setItemAsync(key: string, value: string) {
    memoryFallback.set(key, value);
  },
  async deleteItemAsync(key: string) {
    memoryFallback.delete(key);
  },
};

function isWebRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof localStorage !== 'undefined'
  );
}

const defaultBackend: SecureStorageBackend = {
  async getItemAsync(key: string) {
    if (isWebRuntime()) {
      return localStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },
  async setItemAsync(key: string, value: string) {
    if (isWebRuntime()) {
      localStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
  },
  async deleteItemAsync(key: string) {
    if (isWebRuntime()) {
      localStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      memoryFallback.delete(key);
    }
  },
};

let activeBackend: SecureStorageBackend = defaultBackend;

export function setSecureStorageBackendForTest(backend: SecureStorageBackend | null): void {
  activeBackend = backend ?? memoryStorageBackend;
}

export function clearMemorySecureStorageForTest(): void {
  memoryFallback.clear();
}

export async function saveAuthToken(token: string): Promise<void> {
  await activeBackend.setItemAsync(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return activeBackend.getItemAsync(TOKEN_KEY);
}

export async function deleteAuthToken(): Promise<void> {
  await activeBackend.deleteItemAsync(TOKEN_KEY);
}

export async function saveOnboardingSeen(seen: boolean): Promise<void> {
  await activeBackend.setItemAsync(ONBOARDING_KEY, seen ? '1' : '0');
}

export async function getOnboardingSeen(): Promise<boolean> {
  const value = await activeBackend.getItemAsync(ONBOARDING_KEY);
  return value === '1';
}
