import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, UserStatus } from "@skillconnect/shared";
import type { AppConfig } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/index.js";
import { AppError } from "../lib/errors.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: Exclude<Role, "GUEST">[];
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createAuthMiddleware(prisma: PrismaClient, config: AppConfig) {
  const authenticate = async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : undefined;
      const cookieToken = req.cookies?.accessToken as string | undefined;

      const token = bearerToken || cookieToken;
      if (!token) {
        throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
      }

      // Simple CSRF defense for cookie-authenticated state-changing requests
      if (!bearerToken && cookieToken && STATE_CHANGING_METHODS.has(req.method)) {
        const csrfHeader = req.headers["x-requested-with"];
        if (csrfHeader !== "XMLHttpRequest") {
          throw new AppError(403, "FORBIDDEN", "Missing required request header");
        }
      }

      let payload: { sub?: string };
      try {
        payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub?: string };
      } catch {
        throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
      }

      if (!payload.sub) {
        throw new AppError(401, "UNAUTHENTICATED", "Invalid token payload");
      }

      // AUTH-5: Read user and status from DB on every request
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: true },
      });

      if (!user) {
        throw new AppError(401, "UNAUTHENTICATED", "User not found");
      }

      if (user.status === "SUSPENDED") {
        throw new AppError(401, "ACCOUNT_SUSPENDED", "Account is suspended");
      }

      req.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        roles: user.roles.map((r) => r.role),
      };

      next();
    } catch (err) {
      next(err);
    }
  };

  const requireRole = (...allowedRoles: Exclude<Role, "GUEST">[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
        return;
      }
      const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
      if (!hasRole) {
        next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
        return;
      }
      next();
    };
  };

  return { authenticate, requireRole };
}

/**
 * Scope helper: returns 404 when caller does not own or participate in a resource.
 */
export function assertScope(condition: boolean, message = "Resource not found"): void {
  if (!condition) {
    throw new AppError(404, "NOT_FOUND", message);
  }
}
