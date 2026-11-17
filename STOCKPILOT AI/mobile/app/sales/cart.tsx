import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/ScreenStates';
import { formatMoneyWithCurrency } from '../../src/shared/money';
import { computeCartSummary, usePosCartStore } from '../../src/stores/posCartStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { colors, layout, radii, spacing, typography } from '../../src/theme/tokens';

export default function PosCartScreen() {
  const router = useRouter();
  const currency = useSessionStore((s) => s.shop?.currency ?? 'PKR');

  const items = usePosCartStore((s) => s.items);
  const discountType = usePosCartStore((s) => s.discountType);
  const discountValue = usePosCartStore((s) => s.discountValue);
  const customerId = usePosCartStore((s) => s.customerId);
  const note = usePosCartStore((s) => s.note);
  const paymentMethod = usePosCartStore((s) => s.paymentMethod);
  const tenderedAmount = usePosCartStore((s) => s.tenderedAmount);

  const incrementLine = usePosCartStore((s) => s.incrementLine);
  const decrementLine = usePosCartStore((s) => s.decrementLine);
  const setLineQuantity = usePosCartStore((s) => s.setLineQuantity);
  const setLineUnitPrice = usePosCartStore((s) => s.setLineUnitPrice);
  const removeLine = usePosCartStore((s) => s.removeLine);
  const setDiscount = usePosCartStore((s) => s.setDiscount);
  const setNote = usePosCartStore((s) => s.setNote);
  const reset = usePosCartStore((s) => s.reset);

  const summary = useMemo(
    () =>
      computeCartSummary({
        items,
        discountType,
        discountValue,
        customerId,
        note,
        paymentMethod,
        tenderedAmount,
      }),
    [items, discountType, discountValue, customerId, note, paymentMethod, tenderedAmount],
  );

  if (summary.lines.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Cart" />
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          subtitle="Select products from POS Sale to start billing."
          actionLabel="Browse Products"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const canProceed = !summary.hasInvalidLine && !summary.discountError;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Cart Review"
        subtitle={`${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`}
        rightAction={
          <Pressable
            onPress={() => {
              reset();
              router.back();
            }}
            style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Text style={{ ...typography.labelLg, color: colors.errorText }}>Clear</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.screenPadding,
          gap: spacing.md,
          paddingBottom: 120,
        }}
      >
        {summary.lines.map((line) => {
          const isOverridden = line.unitPriceOverride !== null;
          return (
            <View
              key={line.productId}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: line.quantityError ? colors.errorBorder : colors.border,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>{line.name}</Text>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    Stock: {line.quantityOnHand} {line.unit}
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeLine(line.productId)}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  accessibilityLabel={`Remove ${line.name}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.errorText} />
                </Pressable>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Pressable
                    onPress={() => decrementLine(line.productId)}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.borderInput,
                      backgroundColor: colors.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </Pressable>
                  <TextInput
                    value={line.quantity}
                    onChangeText={(val) => setLineQuantity(line.productId, val)}
                    keyboardType="decimal-pad"
                    style={{
                      minWidth: 64,
                      minHeight: 44,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.borderInput,
                      backgroundColor: colors.background,
                      textAlign: 'center',
                      color: colors.textPrimary,
                      fontWeight: '600',
                      paddingHorizontal: 8,
                    }}
                  />
                  <Pressable
                    onPress={() => incrementLine(line.productId)}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.borderInput,
                      backgroundColor: colors.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </Pressable>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ ...typography.currencyMd, color: colors.textPrimary }}>
                    {formatMoneyWithCurrency(line.lineSubtotal, currency)}
                  </Text>
                  <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                    {formatMoneyWithCurrency(line.effectiveUnitPrice, currency)} / {line.unit}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>Unit Price:</Text>
                <TextInput
                  value={line.unitPriceOverride ?? ''}
                  onChangeText={(val) => setLineUnitPrice(line.productId, val)}
                  placeholder={line.defaultSellingPrice}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: colors.borderInput,
                    backgroundColor: colors.background,
                    paddingHorizontal: 10,
                    color: colors.textPrimary,
                  }}
                />
                {isOverridden ? (
                  <Pressable
                    onPress={() => setLineUnitPrice(line.productId, null)}
                    style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}
                  >
                    <Text style={{ ...typography.labelMd, color: colors.primary }}>Reset</Text>
                  </Pressable>
                ) : null}
              </View>

              {line.quantityError ? (
                <Text style={{ ...typography.bodySm, color: colors.errorText }}>
                  {line.quantityError}
                </Text>
              ) : null}
              {line.exceedsStock ? (
                <Text style={{ ...typography.bodySm, color: colors.warningText }}>
                  Warning: requested quantity exceeds current stock ({line.quantityOnHand}).
                </Text>
              ) : null}
            </View>
          );
        })}

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
          <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>Invoice Discount</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(['AMOUNT', 'PERCENT'] as const).map((mode) => {
              const active = discountType === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setDiscount(mode, discountValue)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.borderInput,
                    backgroundColor: active ? colors.primarySoft : colors.background,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...typography.labelLg,
                      color: active ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {mode === 'AMOUNT' ? `Fixed (${currency})` : 'Percent (%)'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FormField
            label={discountType === 'AMOUNT' ? `Discount (${currency})` : 'Discount (%)'}
            value={discountValue}
            onChangeText={(val) => setDiscount(discountType, val)}
            keyboardType="decimal-pad"
            placeholder="0"
            error={summary.discountError ?? undefined}
          />
          <FormField
            label="Bill Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Warranty notes or remarks..."
          />
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Subtotal</Text>
            <Text style={{ ...typography.titleMd, color: colors.textPrimary }}>
              {formatMoneyWithCurrency(summary.subtotal, currency)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.bodyMd, color: colors.textSecondary }}>Discount</Text>
            <Text style={{ ...typography.titleMd, color: colors.warningText }}>
              -{formatMoneyWithCurrency(summary.discountAmount, currency)}
            </Text>
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: colors.divider,
              marginVertical: 4,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.titleLg, color: colors.textPrimary }}>Total</Text>
            <Text style={{ ...typography.currencyMd, color: colors.primary }}>
              {formatMoneyWithCurrency(summary.total, currency)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          padding: spacing.md,
          minHeight: layout.stickyFooterMinHeight,
        }}
      >
        <PrimaryButton
          title={`Checkout • ${formatMoneyWithCurrency(summary.total, currency)}`}
          disabled={!canProceed}
          onPress={() => router.push('/sales/checkout')}
        />
      </View>
    </SafeAreaView>
  );
}
