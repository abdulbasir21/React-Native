import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { StatusPill } from '../../src/components/StatusPill';
import { listLocalOutboxEntries } from '../../src/db/localServices';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useSyncStore } from '../../src/stores/syncStore';
import type { OutboxEntry } from '../../src/sync/outboxStateMachine';
import { discardOutboxEntry, retryOutboxEntry } from '../../src/sync/syncEngine';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

export default function SyncStatusScreen() {
  const shop = useSessionStore((s) => s.shop);
  const shopId = shop?.id ?? '';

  const isOnline = useSyncStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const needsReviewCount = useSyncStore((s) => s.needsReviewCount);
  const lastSuccessfulSyncAt = useSyncStore((s) => s.lastSuccessfulSyncAt);
  const lastError = useSyncStore((s) => s.lastError);
  const refreshStatus = useSyncStore((s) => s.refreshStatus);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  const loadEntries = useCallback(async () => {
    if (!shopId) return;
    await refreshStatus(shopId);
    const all = await listLocalOutboxEntries(shopId);
    setEntries(all.filter((e) => e.status !== 'SYNCED'));
  }, [shopId, refreshStatus]);

  useFocusEffect(
    useCallback(() => {
      void loadEntries();
    }, [loadEntries]),
  );

  const handleRetry = async (entryId: string) => {
    if (!shopId) return;
    await retryOutboxEntry(shopId, entryId);
    await triggerSync(shopId);
    await loadEntries();
  };

  const handleDiscard = (entry: OutboxEntry) => {
    if (!shopId) return;
    Alert.alert(
      'Discard Pending Change?',
      `Discarding ${entry.operationType} will permanently remove it from the sync queue and related local offline data may be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await discardOutboxEntry(shopId, entry.id, true);
              await loadEntries();
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScreenHeader title="Synchronization" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        {/* Summary Card */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Connection</Text>
            <StatusPill
              label={isOnline ? 'ONLINE' : 'OFFLINE'}
              bg={isOnline ? colors.successBg : colors.warningBg}
              text={isOnline ? colors.successText : colors.warningText}
            />
          </View>
          <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
            Pending operations: {pendingCount} · Needs review: {needsReviewCount}
          </Text>
          <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
            Last successful sync:{' '}
            {lastSuccessfulSyncAt ? new Date(lastSuccessfulSyncAt).toLocaleString() : 'Never'}
          </Text>
          <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
            Sync runs automatically while the app is open and online. Keep the app open briefly
            after reconnecting to finish syncing.
          </Text>
          {lastError ? (
            <Text style={{ ...typography.bodySm, color: colors.error }}>{lastError}</Text>
          ) : null}

          <Pressable
            disabled={!isOnline || isSyncing || !shopId}
            onPress={() => {
              void (async () => {
                await triggerSync(shopId);
                await loadEntries();
              })();
            }}
            style={{
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: !isOnline || isSyncing ? colors.textMuted : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: spacing.xs,
            }}
          >
            <Text style={{ ...typography.labelMd, color: colors.white }}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Text>
          </Pressable>
        </View>

        {/* Outbox Queue */}
        <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
          Pending & Failed Operations ({entries.length})
        </Text>

        {entries.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.lg,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              All local changes are synced with the server.
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View
              key={entry.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  {entry.operationType}
                </Text>
                <StatusPill
                  label={entry.status}
                  bg={entry.status === 'NEEDS_REVIEW' ? colors.errorBg : colors.warningBg}
                  text={entry.status === 'NEEDS_REVIEW' ? colors.errorText : colors.warningText}
                />
              </View>
              <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
                Attempts: {entry.attempts} · Created: {new Date(entry.createdAt).toLocaleString()}
              </Text>
              {entry.lastError ? (
                <Text style={{ ...typography.bodySm, color: colors.error }}>
                  Error: {entry.lastError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <Pressable
                  onPress={() => void handleRetry(entry.id)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radii.sm,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.primary }}>Retry</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDiscard(entry)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radii.sm,
                    backgroundColor: colors.errorBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.labelMd, color: colors.errorText }}>Discard</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
