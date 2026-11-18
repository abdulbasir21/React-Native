import { apiClient } from '../api/client';

export interface AIPendingActionDTO {
  id: string;
  toolName: string;
  summary: string;
  requiresStrongConfirm: boolean;
  strongConfirmTarget: string | null;
  expiresAt: string;
  status: string;
}

export interface AIStructuredAnswerDTO {
  reply: string;
  actualFigures: Record<string, string>;
  estimates: Record<string, string>;
  suggestions: string[];
  pendingActions: AIPendingActionDTO[];
  toolCallsExecuted: string[];
}

export interface AIConversationDTO {
  id: string;
  shopId: string;
  createdAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    structuredJson: AIStructuredAnswerDTO | null;
    createdAt: string;
  }>;
  actions: AIPendingActionDTO[];
}

export function validateStrongConfirmInput(
  action: Pick<AIPendingActionDTO, 'requiresStrongConfirm' | 'strongConfirmTarget'>,
  confirmInput: string,
): string | null {
  if (!action.requiresStrongConfirm) return null;
  if (!confirmInput.trim()) {
    return `Please re-enter "${action.strongConfirmTarget ?? 'confirmation value'}" to confirm.`;
  }
  return null;
}

export const aiRepository = {
  async chat(message: string, conversationId?: string | null): Promise<{
    conversationId: string;
    answer: AIStructuredAnswerDTO;
  }> {
    const res = await apiClient.post<{
      data: { conversationId: string; answer: AIStructuredAnswerDTO };
    }>('/ai/chat', {
      message,
      conversationId: conversationId ?? undefined,
    });
    return res.data.data;
  },

  async listConversations(): Promise<AIConversationDTO[]> {
    const res = await apiClient.get<{ data: { conversations: AIConversationDTO[] } }>(
      '/ai/conversations',
    );
    return res.data.data.conversations;
  },

  async confirmAction(actionId: string, confirmInput?: string): Promise<AIPendingActionDTO> {
    const res = await apiClient.post<{ data: { action: AIPendingActionDTO } }>(
      `/ai/actions/${actionId}/confirm`,
      confirmInput ? { confirmInput } : {},
    );
    return res.data.data.action;
  },

  async rejectAction(actionId: string): Promise<AIPendingActionDTO> {
    const res = await apiClient.post<{ data: { action: AIPendingActionDTO } }>(
      `/ai/actions/${actionId}/reject`,
    );
    return res.data.data.action;
  },
};
