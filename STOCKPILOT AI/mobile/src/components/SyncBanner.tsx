import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSyncStore } from '../stores/syncStore';
import { colors, spacing, typography } from '../theme/tokens';

export function SyncBanner() {
  const router = useRouter();
  const isOnline = useSyncStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const needsReviewCount = useSyncStore((s) => s.needsReviewCount);

  if (isOnline && !isSyncing && pendingCount === 0 && needsReviewCount === 0) {
    return null;
  }

  const bg = !isOnline
    ? colors.warningBg
    : needsReviewCount > 0
      ? colors.errorBg
      : colors.infoBg;
  const fg = !isOnline
    ? colors.warningText
    : needsReviewCount > 0
      ? colors.errorText
      : colors.infoText;

  const message = !isOnline
    ? `Offline mode · ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`
    : isSyncing
      ? 'Syncing changes while app is open...'
      : needsReviewCount > 0
        ? `${needsReviewCount} sync item${needsReviewCount === 1 ? '' : 's'} need review`
        : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`;

  return (
    <Pressable
      onPress={() => router.push('/sync')}
      style={{
        minHeight: 44,
        backgroundColor: bg,
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ ...typography.labelMd, color: fg, flex: 1 }}>{message}</Text>
      <View style={{ paddingLeft: spacing.sm }}>
        <Text style={{ ...typography.labelMd, color: fg }}>Details →</Text>
      </View>
    </Pressable>
  );
}
