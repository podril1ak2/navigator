import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, font, radius } from '../lib/theme';
import { Icon, type SFSymbol } from './Icon';
import { tap } from './ui';

/** iOS-style grouped list primitives for settings-like screens. */

export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      <View style={s.group}>{children}</View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  icon,
  iconColor = colors.accent,
  title,
  subtitle,
  value,
  onPress,
  chevron,
  destructive,
  right,
  first,
}: {
  icon?: SFSymbol;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  right?: ReactNode;
  first?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => (tap(), onPress?.())}
      style={({ pressed }) => [s.row, !first && s.rowDivider, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {icon ? (
        <View style={[s.icon, { backgroundColor: iconColor }]}>
          <Icon name={icon} size={15} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, destructive && { color: colors.red }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={s.value}>{value}</Text> : null}
      {right}
      {chevron ? <Icon name="chevron.right" size={13} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

export function ToggleRow(props: { icon?: SFSymbol; iconColor?: string; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  return (
    <Row
      {...props}
      value={undefined}
      right={<Switch value={props.value} onValueChange={(v) => (tap(), props.onChange(v))} trackColor={{ true: colors.green, false: colors.surfacePressed }} />}
    />
  );
}

export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { value: T; title: string; icon?: SFSymbol }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => (tap(), onChange(o.value))} style={[s.segment, active && s.segmentActive]}>
            {o.icon ? <Icon name={o.icon} size={13} color={active ? colors.text : colors.textSecondary} /> : null}
            <Text style={[s.segmentText, active && { color: colors.text }]}>{o.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SegmentedRow<T extends string | number | null>(props: {
  title: string;
  options: { value: T; title: string; icon?: SFSymbol }[];
  value: T;
  onChange: (v: T) => void;
  first?: boolean;
}) {
  return (
    <View style={[s.segRow, !props.first && s.rowDivider]}>
      <Text style={s.segTitle}>{props.title}</Text>
      <Segmented options={props.options} value={props.value} onChange={props.onChange} />
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 26 },
  title: { ...font.caption, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 7, marginLeft: 16 },
  footer: { color: colors.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 7, marginHorizontal: 16 },
  group: { backgroundColor: colors.surfaceSolid, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 50, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.stroke },
  icon: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  value: { color: colors.textSecondary, fontSize: 15 },
  segRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  segTitle: { color: colors.text, fontSize: 16 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 9, padding: 2 },
  segment: { flex: 1, height: 32, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  segmentActive: { backgroundColor: colors.surfacePressed },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
