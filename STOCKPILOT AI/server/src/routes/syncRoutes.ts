import { Router } from 'express';
import { syncPullController, syncPushController } from '../controllers/syncController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const syncRouter = Router();

syncRouter.use(authenticate);
syncRouter.post('/push', requirePermission('sync:push'), asyncHandler(syncPushController));
syncRouter.get('/pull', requirePermission('sync:pull'), asyncHandler(syncPullController));
