import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { confirmAction, rejectAction } from '../services/aiActionService.js';
import { chatWithAssistant, listAiConversations } from '../services/aiService.js';

const chatBodySchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    conversationId: z.string().uuid().nullable().optional(),
  })
  .strict();

const actionIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const confirmBodySchema = z
  .object({
    confirmInput: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export async function aiChatController(req: Request, res: Response) {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid chat payload',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const result = await chatWithAssistant(req.auth!.shopId, parsed.data);
  sendSuccess(res, result);
}

export async function aiListConversationsController(req: Request, res: Response) {
  const conversations = await listAiConversations(req.auth!.shopId);
  sendSuccess(res, { conversations });
}

export async function aiConfirmActionController(req: Request, res: Response) {
  const params = actionIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    throw badRequest('Invalid action ID');
  }
  const body = confirmBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    throw badRequest(body.error.issues[0]?.message ?? 'Invalid confirm payload');
  }
  const action = await confirmAction(req.auth!.shopId, params.data.id, body.data.confirmInput);
  sendSuccess(res, { action });
}

export async function aiRejectActionController(req: Request, res: Response) {
  const params = actionIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    throw badRequest('Invalid action ID');
  }
  const action = await rejectAction(req.auth!.shopId, params.data.id);
  sendSuccess(res, { action });
}
