import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type AuthUserDto, type LoginInput } from "@skillconnect/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginInput) =>
      apiRequest<{ user: AuthUserDto }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "me"], data.user);
      navigate("/", { replace: true });
    },
  });

  const errorMessage =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? "Unable to sign in"
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-8">
        <div className="mb-6">
          <span className="inline-block rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
            Admin Portal
          </span>
          <h1 className="mt-3 text-2xl font-semibold text-ink">
            Sign in to SkillConnect
          </h1>
          <p className="mt-1 text-sm text-muted">
            Restricted to authorized administrators.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-error/20 bg-error-bg px-4 py-3 text-sm text-error">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={handleSubmit((values) => loginMutation.mutate(values))}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@skillconnect.local"
              {...register("email")}
              className="min-h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink placeholder:text-placeholder focus:border-primary focus:outline-none"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-error">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              {...register("password")}
              className="min-h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink placeholder:text-placeholder focus:border-primary focus:outline-none"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-error">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="min-h-12 w-full cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
