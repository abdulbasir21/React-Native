import type { AuthUserDto, LoginInput, RegisterInput } from "@skillconnect/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import {
  apiRequest,
  clearTokens,
  getStoredTokens,
  saveTokens,
} from "../../api/client";

interface AuthPayload {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery<AuthUserDto | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const { accessToken, refreshToken } = await getStoredTokens();
      if (!accessToken && !refreshToken) return null;
      try {
        const res = await apiRequest<{ user: AuthUserDto }>("/api/v1/auth/me");
        return res.user;
      } catch {
        await clearTokens();
        return null;
      }
    },
    retry: false,
  });

  const signIn = async (input: LoginInput) => {
    const res = await apiRequest<AuthPayload>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      false
    );
    await saveTokens(res.accessToken, res.refreshToken);
    queryClient.setQueryData(["auth", "me"], res.user);
  };

  const signUp = async (input: RegisterInput) => {
    const res = await apiRequest<AuthPayload>(
      "/api/v1/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      false
    );
    await saveTokens(res.accessToken, res.refreshToken);
    queryClient.setQueryData(["auth", "me"], res.user);
  };

  const signOut = async () => {
    const { refreshToken } = await getStoredTokens();
    try {
      await apiRequest(
        "/api/v1/auth/logout",
        {
          method: "POST",
          body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
        },
        false
      );
    } finally {
      await clearTokens();
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
