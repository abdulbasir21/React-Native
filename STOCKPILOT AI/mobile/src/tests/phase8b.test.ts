import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { aiRepository, validateStrongConfirmInput } from '../repositories/aiRepository';

describe('Phase 8b — Mobile AI Assistant repository & strong confirmation validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('BR-AI6: validateStrongConfirmInput enforces non-empty confirmation when requiresStrongConfirm is true', () => {
    expect(
      validateStrongConfirmInput(
        { requiresStrongConfirm: false, strongConfirmTarget: null },
        '',
      ),
    ).toBeNull();

    expect(
      validateStrongConfirmInput(
        { requiresStrongConfirm: true, strongConfirmTarget: '60000.00' },
        '   ',
      ),
    ).toContain('60000.00');

    expect(
      validateStrongConfirmInput(
        { requiresStrongConfirm: true, strongConfirmTarget: '60000.00' },
        '60000.00',
      ),
    ).toBeNull();
  });

  it('BR-AI3, BR-AI12: aiRepository calls chat, confirm, and reject endpoints cleanly', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        data: {
          conversationId: 'conv-1',
          answer: {
            reply: 'Sales today: 4000.00',
            actualFigures: { sales: '4000.00' },
            estimates: {},
            suggestions: [],
            pendingActions: [],
            toolCallsExecuted: ['getSalesReport'],
          },
        },
      },
    } as never);

    const chatRes = await aiRepository.chat('What are my sales?', null);
    expect(chatRes.conversationId).toBe('conv-1');
    expect(postSpy).toHaveBeenCalledWith('/api/v1/ai/chat', {
      message: 'What are my sales?',
      conversationId: undefined,
    });

    postSpy.mockResolvedValueOnce({
      data: { data: { action: { id: 'act-1', status: 'CONFIRMED' } } },
    } as never);
    const conf = await aiRepository.confirmAction('act-1', '60000.00');
    expect(conf.status).toBe('CONFIRMED');
    expect(postSpy).toHaveBeenCalledWith('/api/v1/ai/actions/act-1/confirm', {
      confirmInput: '60000.00',
    });

    postSpy.mockResolvedValueOnce({
      data: { data: { action: { id: 'act-1', status: 'REJECTED' } } },
    } as never);
    const rej = await aiRepository.rejectAction('act-1');
    expect(rej.status).toBe('REJECTED');
    expect(postSpy).toHaveBeenCalledWith('/api/v1/ai/actions/act-1/reject');
  });
});
