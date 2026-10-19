import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { font, radius, useThemed, type Palette } from '../lib/theme';
import { Icon, type SFSymbol } from './Icon';

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

/** Frosted panel that follows the light/dark theme. */
export function Glass({ children, style, radius: r = radius.lg }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  const { colors } = useThemed(makeStyles);
  return (
    <View style={[{ borderRadius: r, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.stroke }, style]}>
      <BlurView intensity={60} tint={colors.glassTint} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassOverlay }]} />
      {children}
    </View>
  );
}

/** Round floating map control. */
export function MapButton({
  icon,
  onPress,
  active,
  label,
  style,
  iconStyle,
}: {
  icon: SFSymbol;
  onPress: () => void;
  active?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable accessibilityLabel={label} onPress={() => (tap(), onPress())} style={({ pressed }) => [pressed && { opacity: 0.7 }, style]}>
      <Glass style={s.mapButton} radius={radius.md}>
        <Icon name={icon} size={19} color={active ? colors.accent : colors.text} style={iconStyle} />
      </Glass>
    </Pressable>
  );
}

/** Vertical group of map buttons sharing one panel, like Apple Maps. */
export function MapButtonGroup({ children }: { children: ReactNode }) {
  return (
    <Glass radius={radius.md} style={{ width: 46 }}>
      {children}
    </Glass>
  );
}

export function GroupButton({ icon, onPress, active, label, divider }: { icon: SFSymbol; onPress: () => void; active?: boolean; label: string; divider?: boolean }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [s.groupButton, divider && s.groupDivider, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      <Icon name={icon} size={18} color={active ? colors.accent : colors.text} />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  style,
  disabled,
  compact,
}: {
  title?: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: SFSymbol;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors, s } = useThemed(makeStyles);
  const bg = { primary: colors.accent, secondary: colors.surfaceRaised, danger: colors.red, ghost: 'transparent' }[kind];
  const fg = kind === 'ghost' ? colors.accent : kind === 'secondary' ? colors.text : colors.onAccent;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [
        s.button,
        compact && s.buttonCompact,
        { backgroundColor: bg },
        !title && { paddingHorizontal: 0, width: compact ? 40 : 50 },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 15 : 17} color={fg} /> : null}
      {title ? (
        <Text style={[s.buttonText, compact && { fontSize: 15 }, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Chip({ title, icon, onPress, active, color }: { title: string; icon?: SFSymbol; onPress: () => void; active?: boolean; color?: string }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [s.chip, active && { backgroundColor: colors.accent }, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Icon name={icon} size={14} color={active ? colors.onAccent : (color ?? colors.textSecondary)} /> : null}
      <Text style={[s.chipText, active && { color: colors.onAccent }]}>{title}</Text>
    </Pressable>
  );
}

/** Small round icon badge used in lists. */
export function IconBadge({ icon, color, size = 34 }: { icon: SFSymbol; color?: string; size?: number }) {
  const { colors } = useThemed(makeStyles);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.48} color={colors.onAccent} />
    </View>
  );
}

/** Bottom sheet panel. */
export function Sheet({ children, bottomInset }: { children: ReactNode; bottomInset: number }) {
  const { s } = useThemed(makeStyles);
  return (
    <Glass style={s.sheet} radius={radius.xl}>
      <View style={[s.sheetInner, { paddingBottom: Math.max(bottomInset, 14) + 4 }]}>
        <View style={s.grabber} />
        {children}
      </View>
    </Glass>
  );
}

export function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable onPress={() => (tap(), onPress())} hitSlop={12} style={({ pressed }) => [s.close, pressed && { opacity: 0.6 }]}>
      <Icon name="xmark" size={12} color={colors.textSecondary} weight="bold" />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  mapButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  groupButton: { height: 46, alignItems: 'center', justifyContent: 'center' },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.stroke },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  buttonCompact: { height: 40, paddingHorizontal: 14, borderRadius: radius.sm },
  buttonText: { ...font.headline },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
  },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '500' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetInner: { paddingHorizontal: 16, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.grabber, marginBottom: 12 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
