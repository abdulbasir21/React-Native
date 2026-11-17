import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

const SLIDES = [
  {
    key: 'pos',
    badge: 'Speed POS',
    icon: 'flash-outline' as const,
    title: 'Sell faster',
    body: 'One-handed checkout designed for busy counters. Add items, apply discounts, and complete sales in 3 taps.',
  },
  {
    key: 'alerts',
    badge: 'Stock Alerts',
    icon: 'notifications-outline' as const,
    title: 'Track stock & costs accurately',
    body: 'Every sale, purchase, return, and damage entry updates weighted average cost and stock movements automatically.',
  },
  {
    key: 'sync',
    badge: 'Offline Sync',
    icon: 'cloud-offline-outline' as const,
    title: 'Never stop selling offline',
    body: 'Keep recording sales and expenses without internet. Sync safely with exact calculations when back online.',
  },
];

/**
 * Matches design/02-onboarding.png.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const setOnboardingSeen = useSessionStore((s) => s.setOnboardingSeen);
  const [step, setStep] = useState(0);

  const slide = SLIDES[step] ?? SLIDES[0]!;
  const isLast = step === SLIDES.length - 1;

  const handleFinish = async (target: '/(auth)/register' | '/(auth)/login') => {
    await setOnboardingSeen(true);
    router.replace(target);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radii.md,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="speedometer-outline" size={20} color={colors.white} />
            </View>
            <Text style={{ ...typography.headlineSm, color: colors.textPrimary }}>StockPilot</Text>
          </View>

          <Pressable
            onPress={() => void handleFinish('/(auth)/login')}
            style={{ minHeight: layout.minTouchTarget, justifyContent: 'center', paddingHorizontal: 10 }}
          >
            <Text style={{ ...typography.labelLg, color: colors.textSecondary }}>Skip</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <View
            style={{
              width: '100%',
              backgroundColor: colors.surface,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.xl,
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: radii.xl,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={slide.icon} size={40} color={colors.primary} />
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Text style={{ ...typography.labelMd, color: colors.primary, fontWeight: '700' }}>
                {slide.badge}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ ...typography.headlineLg, color: colors.textPrimary, textAlign: 'center' }}>
              {slide.title}
            </Text>
            <Text
              style={{
                ...typography.bodyLg,
                color: colors.textSecondary,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              {slide.body}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            {SLIDES.map((s, idx) => {
              const active = idx === step;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setStep(idx)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primarySoft : colors.surface,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...typography.labelMd,
                      color: active ? colors.primary : colors.textSecondary,
                      fontWeight: active ? '700' : '500',
                    }}
                  >
                    {s.badge}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {SLIDES.map((s, idx) => (
              <View
                key={s.key}
                style={{
                  width: idx === step ? 24 : 8,
                  height: 8,
                  borderRadius: radii.pill,
                  backgroundColor: idx === step ? colors.primary : colors.outlineVariant,
                }}
              />
            ))}
          </View>

          <PrimaryButton
            title={isLast ? 'Create Shop Account' : 'Next'}
            onPress={() => {
              if (isLast) {
                void handleFinish('/(auth)/register');
              } else {
                setStep((prev) => prev + 1);
              }
            }}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              Already have an account?
            </Text>
            <Pressable
              onPress={() => void handleFinish('/(auth)/login')}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
            >
              <Text style={{ ...typography.labelLg, color: colors.primary }}>Log in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
