import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import { getSupplierPayableMap } from './purchaseService.js';

function serializeSupplier(
  s: {
    id: string;
    shopId: string;
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  payableBalance = '0.00',
) {
  return {
    id: s.id,
    shopId: s.shopId,
    name: s.name,
    phone: s.phone,
    address: s.address,
    notes: s.notes,
    payableBalance,
    archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function listSuppliers(
  shopId: string,
  options: { page: number; pageSize: number; search?: string; includeArchived?: boolean },
) {
  const prisma = await ensurePrismaConnected();
  const search = options.search?.trim();
  const where = scopeWhere(shopId, {
    ...(options.includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  });

  const [total, rows] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  const payableMap = await getSupplierPayableMap(
    shopId,
    rows.map((r) => r.id),
  );

  return {
    items: rows.map((r) => serializeSupplier(r, payableMap.get(r.id) ?? '0.00')),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export async function getSupplierById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const supplier = await prisma.supplier.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  const verified = assertFoundInShop(supplier, 'Supplier');
  const payableMap = await getSupplierPayableMap(shopId, [verified.id]);
  return serializeSupplier(verified, payableMap.get(verified.id) ?? '0.00');
}

export async function createSupplier(
  shopId: string,
  input: {
    id?: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();
  const created = await prisma.supplier.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      shopId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  return serializeSupplier(created);
}

export async function updateSupplier(
  shopId: string,
  id: string,
  input: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.supplier.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Supplier');

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone === null ? null : input.phone.trim() || null }
        : {}),
      ...(input.address !== undefined
        ? { address: input.address === null ? null : input.address.trim() || null }
        : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes === null ? null : input.notes.trim() || null }
        : {}),
    },
  });
  return serializeSupplier(updated);
}

export async function archiveSupplier(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.supplier.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Supplier');

  const updated = await prisma.supplier.update({
    where: { id },
    data: { archivedAt: existing!.archivedAt ?? new Date() },
  });
  return serializeSupplier(updated);
}
