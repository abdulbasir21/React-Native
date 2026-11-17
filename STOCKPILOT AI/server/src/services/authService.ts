import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { ShopType } from '../shared/enums.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, assertValidTimezone } from '../lib/shopScope.js';
import { signAuthToken } from '../middleware/auth.js';

// Constant-time dummy hash used when email does not exist so timing never leaks account existence (BR-A3).
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8uP2rG9H2D4D6Z2j9r8m7k6Y5v4t3u';

export interface RegisterInput {
  ownerName: string;
  shopName: string;
  email: string;
  password: string;
  shopType: ShopType;
  currency?: string;
  timezone?: string;
  phone?: string | null;
  address?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

function serializeShop(shop: {
  id: string;
  name: string;
  type: string;
  currency: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: shop.id,
    name: shop.name,
    type: shop.type as ShopType,
    currency: shop.currency,
    timezone: shop.timezone,
    address: shop.address,
    phone: shop.phone,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
  };
}

function serializeUser(user: {
  id: string;
  shopId: string;
  email: string;
  ownerName: string;
  phone: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    shopId: user.shopId,
    email: user.email,
    ownerName: user.ownerName,
    phone: user.phone,
    role: user.role as 'OWNER',
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * BR-A1, BR-A2, BR-A6: Creates one Shop and one OWNER User atomically in one transaction.
 */
export async function registerOwnerAndShop(input: RegisterInput) {
  const prisma = await ensurePrismaConnected();
  const normalizedEmail = input.email.trim().toLowerCase();
  const currency = (input.currency?.trim() || 'PKR').toUpperCase();
  const timezone = assertValidTimezone(input.timezone ?? 'Asia/Karachi');
  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: input.shopName.trim(),
          type: input.shopType,
          currency,
          timezone,
          address: input.address?.trim() || null,
          phone: input.phone?.trim() || null,
        },
      });

      const user = await tx.user.create({
        data: {
          shopId: shop.id,
          email: normalizedEmail,
          passwordHash,
          ownerName: input.ownerName.trim(),
          phone: input.phone?.trim() || null,
          role: 'OWNER',
        },
      });

      return { shop, user };
    });

    const token = signAuthToken({
      userId: result.user.id,
      shopId: result.shop.id,
      role: 'OWNER',
    });

    return {
      token,
      user: serializeUser(result.user),
      shop: serializeShop(result.shop),
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('DUPLICATE_EMAIL', 'An account with this email already exists', [
        { field: 'email', message: 'Email already registered' },
      ]);
    }
    throw err;
  }
}

/**
 * BR-A2, BR-A3: Verifies email (lowercase) and bcrypt password hash with generic errors.
 */
export async function loginOwner(input: LoginInput) {
  const prisma = await ensurePrismaConnected();
  const normalizedEmail = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { shop: true },
  });

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw unauthorized('Invalid email or password');
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw unauthorized('Invalid email or password');
  }

  const token = signAuthToken({
    userId: user.id,
    shopId: user.shopId,
    role: 'OWNER',
  });

  return {
    token,
    user: serializeUser(user),
    shop: serializeShop(user.shop),
  };
}

/**
 * Returns the authenticated owner and shop scoped strictly by JWT userId and shopId (BR-A4).
 */
export async function getAuthenticatedOwner(userId: string, shopId: string) {
  const prisma = await ensurePrismaConnected();
  const user = await prisma.user.findFirst({
    where: { id: userId, shopId },
    include: { shop: true },
  });

  const found = assertFoundInShop(user, 'User');
  return {
    user: serializeUser(found),
    shop: serializeShop(found.shop),
  };
}

export { serializeShop, serializeUser };
