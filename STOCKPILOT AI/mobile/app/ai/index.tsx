import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { StatusPill } from '../../src/components/StatusPill';
import {
  aiRepository,
  validateStrongConfirmInput,
  type AIPendingActionDTO,
  type AIStructuredAnswerDTO,
} from '../../src/repositories/aiRepository';
import { useSyncStore } from '../../src/stores/syncStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structured?: AIStructuredAnswerDTO;
}

export default function AIAssistantScreen() {
  const queryClient = useQueryClient();
  const isOnline = useSyncStore((s) => s.isOnline);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [actionsById, setActionsById] = useState<Record<string, AIPendingActionDTO>>({});
  const [strongInputs, setStrongInputs] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || !isOnline) return;

    setErrorMsg(null);
    setInputText('');
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }]);
    setSending(true);

    try {
      const res = await aiRepository.chat(text, conversationId);
      setConversationId(res.conversationId);
      for (const act of res.answer.pendingActions) {
        setActionsById((prev) => ({ ...prev, [act.id]: act }));
      }
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.answer.reply,
          structured: res.answer,
        },
      ]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'AI assistant is currently unavailable. Please try again later.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (action: AIPendingActionDTO) => {
    const strongText = strongInputs[action.id] ?? '';
    const err = validateStrongConfirmInput(action, strongText);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setBusyActionId(action.id);
    setErrorMsg(null);
    try {
      const updated = await aiRepository.confirmAction(
        action.id,
        action.requiresStrongConfirm ? strongText.trim() : undefined,
      );
      setActionsById((prev) => ({ ...prev, [updated.id]: updated }));
      await queryClient.invalidateQueries();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to confirm action');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleReject = async (action: AIPendingActionDTO) => {
    setBusyActionId(action.id);
    setErrorMsg(null);
    try {
      const updated = await aiRepository.rejectAction(action.id);
      setActionsById((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to reject action');
    } finally {
      setBusyActionId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScreenHeader title="AI Business Assistant" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isOnline ? (
          <View
            style={{
              backgroundColor: colors.warningBg,
              padding: spacing.sm,
              paddingHorizontal: spacing.screenPadding,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.warningText }}>
              AI Assistant requires an internet connection. Offline POS & inventory continue to
              work normally.
            </Text>
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: spacing.screenPadding,
            gap: spacing.md,
            paddingBottom: spacing.lg,
          }}
        >
          {turns.length === 0 ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                Ask about your shop
              </Text>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
                Try: &ldquo;What were my sales and profit this week?&rdquo;, &ldquo;Which items are
                low on stock?&rdquo;, or &ldquo;Record a PKR 500 electricity expense&rdquo;.
              </Text>
              <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                All numbers come from your shop records. Any write action requires your confirmation
                before saving.
              </Text>
            </View>
          ) : null}

          {turns.map((t) => (
            <View
              key={t.id}
              style={{
                alignSelf: t.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: t.role === 'user' ? '85%' : '100%',
                backgroundColor: t.role === 'user' ? colors.primary : colors.surface,
                borderRadius: radii.lg,
                borderWidth: t.role === 'user' ? 0 : 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <Text
                style={{
                  ...typography.bodyMd,
                  color: t.role === 'user' ? colors.white : colors.textPrimary,
                }}
              >
                {t.content}
              </Text>

              {t.structured && Object.keys(t.structured.actualFigures).length > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.primarySoft,
                    borderRadius: radii.sm,
                    padding: spacing.sm,
                    gap: 4,
                  }}
                >
                  <Text style={{ ...typography.labelSm, color: colors.primaryDark }}>
                    Actual Figures
                  </Text>
                  {Object.entries(t.structured.actualFigures).map(([k, v]) => (
                    <Text key={k} style={{ ...typography.bodySm, color: colors.textPrimary }}>
                      {k}: {v}
                    </Text>
                  ))}
                </View>
              ) : null}

              {t.structured && Object.keys(t.structured.estimates).length > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.infoBg,
                    borderRadius: radii.sm,
                    padding: spacing.sm,
                    gap: 4,
                  }}
                >
                  <Text style={{ ...typography.labelSm, color: colors.infoText }}>Estimates</Text>
                  {Object.entries(t.structured.estimates).map(([k, v]) => (
                    <Text key={k} style={{ ...typography.bodySm, color: colors.textPrimary }}>
                      {k}: {v}
                    </Text>
                  ))}
                </View>
              ) : null}

              {t.structured && t.structured.suggestions.length > 0 ? (
                <View style={{ gap: 2 }}>
                  <Text style={{ ...typography.labelSm, color: colors.textSecondary }}>
                    Suggestions
                  </Text>
                  {t.structured.suggestions.map((s, idx) => (
                    <Text key={idx} style={{ ...typography.bodySm, color: colors.textSecondary }}>
                      • {s}
                    </Text>
                  ))}
                </View>
              ) : null}

              {t.structured?.pendingActions.map((actRef) => {
                const act = actionsById[actRef.id] ?? actRef;
                const isPending = act.status === 'PENDING';
                const isBusy = busyActionId === act.id;
                return (
                  <View
                    key={act.id}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radii.md,
                      padding: spacing.sm,
                      gap: spacing.xs,
                      backgroundColor: colors.background,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ ...typography.labelMd, color: colors.textPrimary }}>
                        Proposed: {act.toolName}
                      </Text>
                      <StatusPill
                        label={act.status}
                        bg={
                          act.status === 'CONFIRMED'
                            ? colors.successBg
                            : act.status === 'REJECTED' || act.status === 'EXPIRED'
                              ? colors.errorBg
                              : colors.warningBg
                        }
                        text={
                          act.status === 'CONFIRMED'
                            ? colors.successText
                            : act.status === 'REJECTED' || act.status === 'EXPIRED'
                              ? colors.errorText
                              : colors.warningText
                        }
                      />
                    </View>
                    <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
                      {act.summary}
                    </Text>

                    {isPending && act.requiresStrongConfirm ? (
                      <View style={{ gap: 4 }}>
                        <Text style={{ ...typography.labelSm, color: colors.error }}>
                          Re-enter &ldquo;{act.strongConfirmTarget}&rdquo; to confirm:
                        </Text>
                        <TextInput
                          value={strongInputs[act.id] ?? ''}
                          onChangeText={(val) =>
                            setStrongInputs((prev) => ({ ...prev, [act.id]: val }))
                          }
                          placeholder={act.strongConfirmTarget ?? 'Confirm value'}
                          style={{
                            minHeight: 44,
                            borderWidth: 1,
                            borderColor: colors.borderInput,
                            borderRadius: radii.sm,
                            paddingHorizontal: spacing.sm,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                          }}
                        />
                      </View>
                    ) : null}

                    {isPending ? (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                        <Pressable
                          disabled={isBusy}
                          onPress={() => void handleConfirm(act)}
                          style={{
                            flex: 1,
                            minHeight: 44,
                            borderRadius: radii.sm,
                            backgroundColor: colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ ...typography.labelMd, color: colors.white }}>
                            {isBusy ? 'Working...' : 'Confirm'}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={isBusy}
                          onPress={() => void handleReject(act)}
                          style={{
                            flex: 1,
                            minHeight: 44,
                            borderRadius: radii.sm,
                            backgroundColor: colors.errorBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ ...typography.labelMd, color: colors.errorText }}>
                            Reject
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}

          {sending ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Thinking...</Text>
            </View>
          ) : null}

          {errorMsg ? (
            <View
              style={{
                backgroundColor: colors.errorBg,
                borderRadius: radii.md,
                padding: spacing.sm,
              }}
            >
              <Text style={{ ...typography.bodySm, color: colors.errorText }}>{errorMsg}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            padding: spacing.screenPadding,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask StockPilot AI..."
            editable={isOnline && !sending}
            style={{
              flex: 1,
              minHeight: 48,
              borderWidth: 1,
              borderColor: colors.borderInput,
              borderRadius: radii.md,
              paddingHorizontal: spacing.md,
              color: colors.textPrimary,
              backgroundColor: colors.background,
            }}
          />
          <Pressable
            disabled={!isOnline || sending || !inputText.trim()}
            onPress={() => void handleSend()}
            style={{
              minWidth: 64,
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor:
                !isOnline || sending || !inputText.trim() ? colors.textMuted : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.white }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
