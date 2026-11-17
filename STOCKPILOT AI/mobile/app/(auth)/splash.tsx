import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';

/**
 * Matches design/01-splash-screen.png: pine/emerald canvas, brand badge, zero-downtime pill.
 */
export default function SplashScreen() {
  const router = useRouter();
  const hydrateSession = useSessionStore((s) => s.hydrateSession);
  const hydrated = useSessionStore((s) => s.hydrated);
  const token = useSessionStore((s) => s.token);
  const onboardingSeen = useSessionStore((s) => s.onboardingSeen);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!hydrated) return;
    if (token) {
      router.replace('/(tabs)');
    } else if (onboardingSeen) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(auth)/onboarding');
    }
  }, [hydrated, token, onboardingSeen, router]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.primaryDark,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View />

      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            backgroundColor: 'rgba(255,255,255,0.14)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="cube-outline" size={44} color={colors.white} />
          <View
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 30,
              height: 30,
              borderRadius: radii.pill,
              backgroundColor: colors.primaryDeep,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.primaryFixed,
            }}
          >
            <Ionicons name="sparkles" size={14} color={colors.secondary} />
          </View>
        </View>

        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.white, letterSpacing: -0.5 }}>
          StockPilot <Text style={{ color: colors.primaryFixed }}>AI</Text>
        </Text>

        <Text
          style={{
            ...typography.bodyLg,
            color: 'rgba(255,255,255,0.86)',
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          Smart POS & Retail Engine for Shopkeepers
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: 'rgba(255,255,255,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.20)',
            marginTop: spacing.xs,
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.primaryFixed} />
          <Text style={{ ...typography.labelSm, color: colors.white, letterSpacing: 1 }}>
            ZERO DOWNTIME SYNC
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <ActivityIndicator color={colors.primaryFixed} />
        <Text style={{ ...typography.bodySm, color: 'rgba(255,255,255,0.75)' }}>
          Offline-First Edition
        </Text>
      </View>
    </SafeAreaView>
  );
}
