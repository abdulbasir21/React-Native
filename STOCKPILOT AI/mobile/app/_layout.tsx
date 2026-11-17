import '../global.css';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SyncBanner } from '../src/components/SyncBanner';
import { useSessionStore } from '../src/stores/sessionStore';
import { useSyncStore } from '../src/stores/syncStore';

export default function RootLayout() {
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

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {hydrated && !!token ? <SyncBanner /> : null}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={hydrated && !!token}>
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
          </Stack.Protected>
          <Stack.Protected guard={!hydrated || !token}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
