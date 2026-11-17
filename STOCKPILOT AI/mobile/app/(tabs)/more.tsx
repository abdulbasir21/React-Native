import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

const MORE_ITEMS: Array<{
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route:
    | '/sales/history'
    | '/purchases'
    | '/expenses'
    | '/suppliers'
    | '/customers'
    | '/stock-movements'
    | '/sync'
    | '/ai'
    | '/settings';
}> = [
  {
    title: 'Sales History',
    subtitle: 'View completed bills, receipts & payments',
    icon: 'receipt-outline',
    route: '/sales/history',
  },
  {
    title: 'Purchases',
    subtitle: 'Record supplier stock purchases & payments',
    icon: 'cart-outline',
    route: '/purchases',
  },
  {
    title: 'Expenses',
    subtitle: 'Track rent, bills & operating costs',
    icon: 'receipt-outline',
    route: '/expenses',
  },
  {
    title: 'Suppliers',
    subtitle: 'Manage wholesale vendors & payable balances',
    icon: 'business-outline',
    route: '/suppliers',
  },
  {
    title: 'Customers',
    subtitle: 'Manage regular buyers & credit accounts',
    icon: 'people-outline',
    route: '/customers',
  },
  {
    title: 'Stock Movements',
    subtitle: 'View complete inventory movement log',
    icon: 'swap-vertical-outline',
    route: '/stock-movements',
  },
  {
    title: 'AI Business Assistant',
    subtitle: 'Ask questions & confirm proposed business actions',
    icon: 'sparkles-outline',
    route: '/ai',
  },
  {
    title: 'Synchronization',
    subtitle: 'Pending offline changes, sync errors & last sync',
    icon: 'cloud-upload-outline',
    route: '/sync',
  },
  {
    title: 'Shop Settings',
    subtitle: 'Shop name, type, currency & timezone',
    icon: 'settings-outline',
    route: '/settings',
  },
];

export default function MoreTabScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const shop = useSessionStore((s) => s.shop);
  const clearSession = useSessionStore((s) => s.clearSession);

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screenPadding, gap: spacing.md }}>
        <Text style={{ ...typography.headlineMd, color: colors.textPrimary }}>More</Text>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            gap: 6,
          }}
        >
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
            {shop?.name ?? 'Shop Account'}
          </Text>
          <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>{user?.email}</Text>
          <Text style={{ ...typography.bodySm, color: colors.textMuted }}>
            Role: {user?.role ?? 'OWNER'} · Currency: {shop?.currency ?? 'PKR'} ·{' '}
            {shop?.timezone ?? 'Asia/Karachi'}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {MORE_ITEMS.map((item, idx) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route)}
              style={{
                minHeight: layout.minTouchTarget + 12,
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radii.md,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{item.title}</Text>
                <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <PrimaryButton title="Sign Out" variant="danger" onPress={() => void handleLogout()} />
      </ScrollView>
    </SafeAreaView>
  );
}
