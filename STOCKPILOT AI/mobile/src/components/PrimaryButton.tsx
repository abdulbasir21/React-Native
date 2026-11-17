import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, type ViewStyle } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.errorBg
        : colors.surface;
  const textColor =
    variant === 'primary'
      ? colors.white
      : variant === 'danger'
        ? colors.errorText
        : colors.textPrimary;
  const borderColor =
    variant === 'danger'
      ? colors.errorBorder
      : variant === 'secondary'
        ? colors.borderInput
        : 'transparent';

  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 35,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        disabled={isDisabled}
        style={[
          {
            minHeight: layout.buttonPrimaryHeight,
            borderRadius: radii.md,
            backgroundColor: bg,
            borderWidth: variant === 'primary' ? 0 : 1,
            borderColor,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            paddingHorizontal: spacing.md,
            opacity: isDisabled ? 0.6 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <Text style={{ ...typography.titleMd, fontWeight: '700', color: textColor }}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
