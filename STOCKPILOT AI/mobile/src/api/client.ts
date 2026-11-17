import axios, { type AxiosInstance } from 'axios';

export interface ApiSuccessResponse<T, M = undefined> {
  success: true;
  data: T;
  meta?: M;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message?: string }>;
  };
}

export interface HealthData {
  status: string;
  service: string;
}

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url && url.trim().length > 0) {
    return url.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:4000/api/v1';
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let currentToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setApiAuthToken(token: string | null): void {
  currentToken = token;
}

export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorizedCallback = cb;
}

apiClient.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      onUnauthorizedCallback?.();
    }
    return Promise.reject(error);
  },
);

export async function fetchHealth(): Promise<HealthData> {
  const res = await apiClient.get<ApiSuccessResponse<HealthData>>('/health');
  return res.data.data;
}

export function extractApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiMessage = error.response?.data?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    if (!error.response) {
      return 'Unable to connect to server. Check your internet connection.';
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
