const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Type": "web",
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers ?? {}),
    },
  });
}

let refreshingPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshingPromise) {
    refreshingPromise = rawFetch("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshingPromise = null;
      });
  }
  return refreshingPromise;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  retryOn401 = true
): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401 && retryOn401 && !path.includes("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawFetch(path, init);
    }
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? "REQUEST_FAILED",
      json?.error?.message ?? "Request failed"
    );
  }

  return json.data as T;
}
