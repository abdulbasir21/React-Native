import { Prisma } from '@prisma/client';
import { conflict } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';

function serializeCategory(cat: {
  id: string;
  shopId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: cat.id,
    shopId: cat.shopId,
    name: cat.name,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
  };
}

export async function listCategories(shopId: string) {
  const prisma = await ensurePrismaConnected();
  const rows = await prisma.category.findMany({
    where: scopeWhere(shopId),
    orderBy: { name: 'asc' },
  });
  return rows.map(serializeCategory);
}

export async function createCategory(
  shopId: string,
  input: { id?: string; name: string },
) {
  const prisma = await ensurePrismaConnected();
  const name = input.name.trim();
  const existing = await prisma.category.findFirst({
    where: scopeWhere(shopId, {
      name: { equals: name, mode: 'insensitive' as const },
    }),
    select: { id: true },
  });
  if (existing) {
    throw conflict('DUPLICATE_CATEGORY', `Category "${name}" already exists`, [
      { field: 'name' },
    ]);
  }

  try {
    const created = await prisma.category.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        shopId,
        name,
      },
    });
    return serializeCategory(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('DUPLICATE_CATEGORY', `Category "${name}" already exists`, [
        { field: 'name' },
      ]);
    }
    throw err;
  }
}

export async function updateCategory(
  shopId: string,
  id: string,
  input: { name: string },
) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.category.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Category');

  const name = input.name.trim();
  const duplicate = await prisma.category.findFirst({
    where: scopeWhere(shopId, {
      name: { equals: name, mode: 'insensitive' as const },
      id: { not: id },
    }),
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('DUPLICATE_CATEGORY', `Category "${name}" already exists`, [
      { field: 'name' },
    ]);
  }

  const updated = await prisma.category.update({
    where: { id },
    data: { name },
  });
  return serializeCategory(updated);
}
