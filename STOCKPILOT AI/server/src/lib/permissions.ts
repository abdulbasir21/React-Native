export const PERMISSIONS = [
  'shop:read',
  'shop:write',
  'product:read',
  'product:write',
  'product:archive',
  'stock:read',
  'stock:adjust',
  'customer:read',
  'customer:write',
  'supplier:read',
  'supplier:write',
  'sale:read',
  'sale:create',
  'sale:return',
  'sale:cancel',
  'payment:create',
  'purchase:read',
  'purchase:create',
  'expense:read',
  'expense:write',
  'report:read',
  'sync:push',
  'sync:pull',
  'ai:use',
  'ai:confirm',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMISSIONS = new Set<Permission>(PERMISSIONS);

export function hasPermission(role: string, permission: Permission): boolean {
  if (role === 'OWNER') {
    return OWNER_PERMISSIONS.has(permission);
  }
  return false;
}
