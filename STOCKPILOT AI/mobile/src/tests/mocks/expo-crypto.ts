import { randomUUID } from 'node:crypto';

export function randomUUIDAlias(): string {
  return randomUUID();
}

export { randomUUIDAlias as randomUUID };
