import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';

interface FormFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  rightHint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  isPassword?: boolean;
}

export function FormField({
  label,
  required,
  rightHint,
  icon,
  error,
  isPassword,
  style,
  ...inputProps
}: FormFieldProps) {
  const [hidden, setHidden] = useState(Boolean(isPassword));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...typography.labelLg, color: colors.textPrimary }}>
          {label}
          {required ? <Text style={{ color: colors.error }}> *</Text> : null}
        </Text>
        {rightHint ? (
          <Text style={{ ...typography.labelMd, color: colors.textSecondary }}>{rightHint}</Text>
        ) : null}
      </View>

      <View
        style={{
          minHeight: layout.inputHeight,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: error ? colors.error : colors.borderInput,
          paddingHorizontal: 14,
          gap: spacing.sm,
        }}
      >
        {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword ? hidden : inputProps.secureTextEntry}
          style={[
            {
              flex: 1,
              minHeight: layout.inputHeight - 2,
              fontSize: 15,
              color: colors.textPrimary,
            },
            style,
          ]}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((prev) => !prev)}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: -8,
            }}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={{ ...typography.bodySm, color: colors.error }}>{error}</Text>
      ) : null}
    </View>
  );
}
