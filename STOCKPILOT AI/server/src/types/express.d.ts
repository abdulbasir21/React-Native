import { type Permission } from './permissions.js';

export interface AuthContext {
  userId: string;
  shopId: string;
  role: 'OWNER';
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    requiredPermission?: Permission;
  }
}
