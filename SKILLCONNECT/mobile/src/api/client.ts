import * as SecureStore from "expo-secure-store";
import type { AuthUserDto } from "@skillconnect/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

const ACCESS_KEY = "skillconnect_access_token";
const REFRESH_KEY = "skillconnect_refresh_token";

export class MobileApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function getStoredTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshToken } = await getStoredTokens();
      if (!refreshToken) return null;

      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        await clearTokens();
        return null;
      }

      const data = json.data as {
        user: AuthUserDto;
        accessToken: string;
        refreshToken: string;
      };
      await saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })()
      .catch(async () => {
        await clearTokens();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  retryOn401 = true
): Promise<T> {
  const { accessToken } = await getStoredTokens();
  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

  let res = await doFetch(accessToken);

  if (res.status === 401 && retryOn401 && !path.includes("/auth/")) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      res = await doFetch(newAccess);
    }
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new MobileApiError(
      res.status,
      json?.error?.code ?? "REQUEST_FAILED",
      json?.error?.message ?? "Request failed"
    );
  }

  return json.data as T;
}

export async function uploadImageRequest(
  uri: string,
  folder: string
): Promise<{ url: string; fileId: string }> {
  const { accessToken } = await getStoredTokens();
  const form = new FormData();
  const filename = uri.split("/").pop() || "upload.jpg";
  const ext = filename.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  form.append("folder", folder);
  form.append("file", {
    uri,
    name: filename,
    type: mime,
  } as unknown as Blob);

  const res = await fetch(`${API_URL}/api/v1/uploads/image`, {
    method: "POST",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new MobileApiError(
      res.status,
      json?.error?.code ?? "UPLOAD_FAILED",
      json?.error?.message ?? "Image upload failed"
    );
  }
  return json.data as { url: string; fileId: string };
}
