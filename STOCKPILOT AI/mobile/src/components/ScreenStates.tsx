import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';

export function FadeInView({ children, duration = 220 }: { children: ReactNode; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start();
  }, [duration, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <FadeInView duration={180}>
      <View style={{ padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>{message}</Text>
      </View>
    </FadeInView>
  );
}

export function ErrorState({
  message = 'Unable to load data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View
      style={{
        margin: spacing.screenPadding,
        padding: spacing.lg,
        backgroundColor: colors.errorBg,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.errorBorder,
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <Ionicons name="alert-circle-outline" size={32} color={colors.errorText} />
      <Text style={{ ...typography.titleMd, color: colors.errorText, textAlign: 'center' }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            minHeight: layout.minTouchTarget,
            paddingHorizontal: 18,
            borderRadius: radii.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.errorBorder,
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...typography.labelLg, color: colors.errorText }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        margin: spacing.screenPadding,
        padding: spacing.xl,
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radii.xl,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={{ ...typography.titleLg, color: colors.textPrimary, textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={{
            marginTop: spacing.xs,
            minHeight: layout.minTouchTarget,
            paddingHorizontal: 20,
            borderRadius: radii.md,
            backgroundColor: colors.primary,
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...typography.labelLg, color: colors.white }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
