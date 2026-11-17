import '../global.css';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SyncBanner } from '../src/components/SyncBanner';
import { useSessionStore } from '../src/stores/sessionStore';
import { useSyncStore } from '../src/stores/syncStore';
import { colors, radii, spacing, typography } from '../src/theme/tokens';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            padding: spacing.lg,
            justifyContent: 'center',
            gap: spacing.md,
          }}
        >
          <Text style={{ ...typography.headlineMd, color: colors.errorText }}>
            Something went wrong
          </Text>
          <ScrollView style={{ maxHeight: 240 }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>
              {this.state.error.message}
            </Text>
          </ScrollView>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              minHeight: 48,
              backgroundColor: colors.primary,
              borderRadius: radii.md,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.titleMd, color: colors.white }}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  const token = useSessionStore((s) => s.token);
  const shop = useSessionStore((s) => s.shop);
  const hydrated = useSessionStore((s) => s.hydrated);
  const hydrateSession = useSessionStore((s) => s.hydrateSession);
  const setOnline = useSyncStore((s) => s.setOnline);
  const refreshStatus = useSyncStore((s) => s.refreshStatus);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup && segments.length > 0) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [hydrated, token, segments, router]);

  useEffect(() => {
    const shopId = shop?.id;
    if (!hydrated || !token || !shopId) return;

    void refreshStatus(shopId);
    void triggerSync(shopId);

    const unsubNet = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(online);
      if (online) {
        void triggerSync(shopId);
      }
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void triggerSync(shopId);
      }
    });

    return () => {
      unsubNet();
      appStateSub.remove();
    };
  }, [hydrated, token, shop?.id, setOnline, refreshStatus, triggerSync]);

  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {token ? <SyncBanner /> : null}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="products/form" />
            <Stack.Screen name="products/[id]" />
            <Stack.Screen name="stock-movements/index" />
            <Stack.Screen name="suppliers/index" />
            <Stack.Screen name="suppliers/[id]" />
            <Stack.Screen name="purchases/index" />
            <Stack.Screen name="purchases/new" />
            <Stack.Screen name="purchases/[id]" />
            <Stack.Screen name="expenses/index" />
            <Stack.Screen name="expenses/form" />
            <Stack.Screen name="customers/index" />
            <Stack.Screen name="customers/form" />
            <Stack.Screen name="customers/[id]" />
            <Stack.Screen name="sales/cart" />
            <Stack.Screen name="sales/checkout" />
            <Stack.Screen name="sales/receipt/[id]" />
            <Stack.Screen name="sales/history" />
            <Stack.Screen name="sales/[id]" />
            <Stack.Screen name="sync/index" />
            <Stack.Screen name="ai/index" />
            <Stack.Screen name="settings/index" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
