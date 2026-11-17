import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractApiErrorMessage } from '../../../src/api/client';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { ErrorState, LoadingState } from '../../../src/components/ScreenStates';
import { StatusPill } from '../../../src/components/StatusPill';
import {
  exportAndShareReceiptPdf,
  formatReceiptDateTime,
  shareReceiptText,
} from '../../../src/lib/receiptHtml';
import { saleRepository } from '../../../src/repositories/saleRepository';
import { cmpDecimal, formatMoneyWithCurrency } from '../../../src/shared/money';
import { colors, paymentStatusColors, radii, spacing, typography } from '../../../src/theme/tokens';

export default function SaleReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const receiptQuery = useQuery({
    queryKey: ['sale-receipt', id],
    queryFn: () => saleRepository.getReceipt(id),
    enabled: Boolean(id),
  });

  if (receiptQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Receipt" />
        <LoadingState message="Loading receipt..." />
      </SafeAreaView>
    );
  }

  if (receiptQuery.isError || !receiptQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Receipt" />
        <ErrorState
          message={extractApiErrorMessage(receiptQuery.error, 'Receipt could not be loaded')}
          onRetry={() => void receiptQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { shop, sale } = receiptQuery.data;
  const cur = shop.currency || 'PKR';
  const statusStyle = paymentStatusColors[sale.paymentStatus];
  const hasDiscount = cmpDecimal(sale.discountAmount, 0) > 0;
  const hasBalance = cmpDecimal(sale.balanceDue, 0) > 0;

  const handleExportPdf = async () => {
    setActionError(null);
    setExportingPdf(true);
    try {
      await exportAndShareReceiptPdf(receiptQuery.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate receipt PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleShareText = async () => {
    setActionError(null);
    try {
      await shareReceiptText(receiptQuery.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to share receipt');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Sale Receipt"
        subtitle={sale.receiptNo}
        rightAction={
          <Pressable
            onPress={() => router.replace('/(tabs)/sales')}
            style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Text style={{ ...typography.labelLg, color: colors.primary }}>New Sale</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: 40,
        }}
      >
        {sale.warnings.length > 0 ? (
          <View
            style={{
              backgroundColor: colors.warningBg,
              borderRadius: radii.md,
              padding: spacing.md,
              gap: 4,
            }}
          >
            <Text style={{ ...typography.labelLg, color: colors.warningText }}>Notices</Text>
            <Text style={{ ...typography.bodySm, color: colors.warningText }}>
              {sale.warnings.join(' • ')}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            gap: spacing.md,
          }}
        >
          <View style={{ alignItems: 'center', gap: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
            <Text style={{ ...typography.headlineSm, color: colors.primaryDark }}>{shop.name}</Text>
            {shop.address ? (
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>{shop.address}</Text>
            ) : null}
            {shop.phone ? (
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                Tel: {shop.phone}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <StatusPill label={sale.paymentStatus} bg={statusStyle.bg} text={statusStyle.text} />
              {sale.status === 'CANCELLED' ? (
                <StatusPill label="CANCELLED" bg={colors.errorBg} text={colors.errorText} />
              ) : null}
            </View>
          </View>

          <View style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Receipt #</Text>
              <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>{sale.receiptNo}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Date</Text>
              <Text style={{ ...typography.bodySm, color: colors.textPrimary }}>
                {formatReceiptDateTime(sale.occurredAt, shop.timezone)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Customer</Text>
              <Text style={{ ...typography.bodySm, color: colors.textPrimary }}>
                {sale.customer?.name ?? 'Walk-in Customer'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Method</Text>
              <Text style={{ ...typography.bodySm, color: colors.textPrimary }}>
                {sale.paymentMethod}
              </Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {(sale.items ?? []).map((item) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                    {item.productNameSnapshot}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    {item.quantity} {item.unitSnapshot} ×{' '}
                    {formatMoneyWithCurrency(item.unitPrice, cur)}
                    {cmpDecimal(item.allocatedDiscount, 0) > 0
                      ? ` (disc -${formatMoneyWithCurrency(item.allocatedDiscount, cur)})`
                      : ''}
                  </Text>
                </View>
                <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                  {formatMoneyWithCurrency(item.lineNet, cur)}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              paddingTop: 12,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Subtotal</Text>
              <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
                {formatMoneyWithCurrency(sale.subtotal, cur)}
              </Text>
            </View>
            {hasDiscount ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Discount</Text>
                <Text style={{ ...typography.titleMd, color: colors.warningText }}>
                  -{formatMoneyWithCurrency(sale.discountAmount, cur)}
                </Text>
              </View>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>Total</Text>
              <Text style={{ ...typography.currencyMd, color: colors.primary }}>
                {formatMoneyWithCurrency(sale.total, cur)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Paid</Text>
              <Text style={{ ...typography.titleMd, color: colors.successText }}>
                {formatMoneyWithCurrency(sale.amountPaid, cur)}
              </Text>
            </View>
            {hasBalance ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...typography.titleMd, color: colors.warningText }}>Balance Due</Text>
                <Text style={{ ...typography.titleMd, color: colors.warningText }}>
                  {formatMoneyWithCurrency(sale.balanceDue, cur)}
                </Text>
              </View>
            ) : null}
          </View>

          {sale.note ? (
            <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>Note: {sale.note}</Text>
          ) : null}
        </View>

        {actionError ? (
          <Text style={{ ...typography.bodyMd, color: colors.errorText }}>{actionError}</Text>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <PrimaryButton
            title="Export & Share PDF"
            loading={exportingPdf}
            onPress={() => void handleExportPdf()}
          />
          <PrimaryButton
            title="Share Receipt Text"
            variant="secondary"
            onPress={() => void handleShareText()}
          />
          <Pressable
            onPress={() => router.push(`/sales/${sale.id}`)}
            style={{
              minHeight: 48,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.textPrimary} />
            <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>
              View Sale Details & Payments
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
