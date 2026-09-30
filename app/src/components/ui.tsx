import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { colors, font, radius, space } from '../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: colors.primary, secondary: colors.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = variant === 'danger' ? colors.down : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'gold' | 'red';
}) {
  const toneColor = tone === 'gold' ? colors.gold : tone === 'red' ? colors.primary : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
        toneColor && { borderColor: toneColor },
      ]}
    >
      <Text style={[styles.chipText, toneColor && { color: toneColor }, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Delta({ amount, pct, format }: { amount: number; pct: number | null; format: (n: number) => string }) {
  const up = amount >= 0;
  const color = amount === 0 ? colors.textMuted : up ? colors.up : colors.down;
  return (
    <View style={styles.row}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={color} />
      <Text style={{ color, fontWeight: '600', fontSize: 13 }}>
        {format(Math.abs(amount))}
        {pct !== null ? ` (${(Math.abs(pct) * 100).toFixed(Math.abs(pct) < 0.1 ? 1 : 0)}%)` : ''}
      </Text>
    </View>
  );
}

/** Currency input: numeric keyboard, prefix symbol, optional. */
export function MoneyInput({
  value,
  onChangeText,
  placeholder,
  currency,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  currency: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.moneyInput}>
      <Text style={styles.moneyPrefix}>{currency}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? '0.00'}
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="done"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        style={styles.moneyText}
      />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text style={[font.h2, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[font.body, { color: colors.textMuted, textAlign: 'center' }]}>{body}</Text>
      {action}
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  label: { ...font.label, color: colors.textDim },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  moneyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  moneyPrefix: { color: colors.textDim, fontWeight: '700', marginRight: space.sm },
  moneyText: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', paddingVertical: space.sm },
  empty: { alignItems: 'center', gap: space.md, padding: space.xxl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
