import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import type { createAuthService } from "./auth.service.js";

export function createAuthController(
  authService: ReturnType<typeof createAuthService>,
  config: AppConfig
) {
  const isWebCookieClient = (req: Request) =>
    req.headers["x-client-type"] === "web";

  const setAuthCookies = (
    res: Response,
    accessToken: string,
    refreshToken: string
  ) => {
    const isProd = config.NODE_ENV === "production";
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: config.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
      path: "/",
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth",
    });
  };

  const clearAuthCookies = (res: Response) => {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/api/v1/auth" });
  };

  const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      if (isWebCookieClient(req)) {
        if (!result.user.roles.includes("ADMIN")) {
          throw new AppError(403, "FORBIDDEN", "Admin access required");
        }
        setAuthCookies(res, result.accessToken, result.refreshToken);
        sendSuccess(res, { user: result.user });
        return;
      }
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken =
        (req.body?.refreshToken as string | undefined) ||
        (req.cookies?.refreshToken as string | undefined);

      if (!rawToken) {
        throw new AppError(401, "UNAUTHENTICATED", "Refresh token is required");
      }

      const result = await authService.refresh(rawToken);
      if (isWebCookieClient(req) || (!req.body?.refreshToken && req.cookies?.refreshToken)) {
        setAuthCookies(res, result.accessToken, result.refreshToken);
        sendSuccess(res, { user: result.user });
        return;
      }
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken =
        (req.body?.refreshToken as string | undefined) ||
        (req.cookies?.refreshToken as string | undefined);
      await authService.logout(rawToken);
      clearAuthCookies(res);
      sendSuccess(res, { loggedOut: true });
    } catch (err) {
      next(err);
    }
  };

  const me = async (req: Request, res: Response) => {
    sendSuccess(res, { user: req.user });
  };

  return { register, login, refresh, logout, me };
}
