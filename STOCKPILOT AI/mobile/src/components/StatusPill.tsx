import { Text, View } from 'react-native';
import { radii, typography } from '../theme/tokens';

export function StatusPill({
  label,
  bg,
  text,
}: {
  label: string;
  bg: string;
  text: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radii.pill,
        backgroundColor: bg,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ ...typography.labelSm, color: text }}>{label}</Text>
    </View>
  );
}
