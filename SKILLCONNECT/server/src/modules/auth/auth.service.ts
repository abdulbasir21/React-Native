import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { AuthUserDto, LoginInput, RegisterInput } from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";

const BCRYPT_COST = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUserDto;
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function signAccessToken(userId: string, config: AppConfig): string {
  return jwt.sign({ sub: userId }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

function toAuthUserDto(user: {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "SUSPENDED";
  roles: { role: "CUSTOMER" | "PROVIDER" | "ADMIN" }[];
}): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles.map((r) => r.role),
  };
}

export function createAuthService(prisma: PrismaClient, config: AppConfig) {
  const refreshExpiryDate = () =>
    new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const register = async (input: RegisterInput): Promise<AuthResult> => {
    const email = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const rawRefresh = generateRawRefreshToken();

    // T1: User, UserRole (CUSTOMER), CustomerProfile in one transaction
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: input.fullName,
          status: "ACTIVE",
          roles: { create: [{ role: "CUSTOMER" }] },
          customerProfile: { create: {} },
          refreshTokens: {
            create: {
              tokenHash: hashToken(rawRefresh),
              expiresAt: refreshExpiryDate(),
            },
          },
        },
        include: { roles: true },
      });
      return created;
    });

    return {
      user: toAuthUserDto(user),
      accessToken: signAccessToken(user.id, config),
      refreshToken: rawRefresh,
    };
  };

  const login = async (input: LoginInput): Promise<AuthResult> => {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (!user) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    // AUTH-5: Suspended user cannot log in
    if (user.status === "SUSPENDED") {
      throw new AppError(401, "ACCOUNT_SUSPENDED", "Account is suspended");
    }

    const rawRefresh = generateRawRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt: refreshExpiryDate(),
      },
    });

    return {
      user: toAuthUserDto(user),
      accessToken: signAccessToken(user.id, config),
      refreshToken: rawRefresh,
    };
  };

  const refresh = async (rawRefreshToken: string): Promise<AuthResult> => {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: true } } },
    });

    if (!existing) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }

    // AUTH-6: Reusing an already-rotated refresh token revokes all of that user's refresh tokens
    if (existing.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(
        401,
        "TOKEN_REUSE_DETECTED",
        "Refresh token reuse detected; all sessions revoked"
      );
    }

    if (existing.expiresAt <= new Date()) {
      throw new AppError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token expired");
    }

    if (existing.user.status === "SUSPENDED") {
      throw new AppError(401, "ACCOUNT_SUSPENDED", "Account is suspended");
    }

    const nextRawRefresh = generateRawRefreshToken();

    // T11: Revoke old token and insert new token in one transaction
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: hashToken(nextRawRefresh),
          expiresAt: refreshExpiryDate(),
        },
      });
    });

    return {
      user: toAuthUserDto(existing.user),
      accessToken: signAccessToken(existing.userId, config),
      refreshToken: nextRawRefresh,
    };
  };

  const logout = async (rawRefreshToken?: string): Promise<void> => {
    if (!rawRefreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  };

  return { register, login, refresh, logout };
}
