import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: ReactNode;
}) {
  const router = useRouter();

  return (
    <View
      style={{
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: -8,
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.headlineSm, color: colors.textPrimary }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}
