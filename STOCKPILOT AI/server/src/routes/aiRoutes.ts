import { Router } from 'express';
import {
  aiChatController,
  aiConfirmActionController,
  aiListConversationsController,
  aiRejectActionController,
} from '../controllers/aiController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const aiRouter = Router();

aiRouter.use(authenticate);
aiRouter.post('/chat', requirePermission('ai:use'), asyncHandler(aiChatController));
aiRouter.get('/conversations', requirePermission('ai:use'), asyncHandler(aiListConversationsController));
aiRouter.post('/actions/:id/confirm', requirePermission('ai:confirm'), asyncHandler(aiConfirmActionController));
aiRouter.post('/actions/:id/reject', requirePermission('ai:confirm'), asyncHandler(aiRejectActionController));
