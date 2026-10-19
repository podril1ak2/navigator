import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import type { Place, Route, TravelMode } from '../lib/api';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { type Palette, font, radius, useThemed } from '../lib/theme';
import { Icon, type SFSymbol } from './Icon';
import { ManeuverArrow } from './ManeuverArrow';
import { Button, CloseButton, Sheet, tap } from './ui';

const MODES: { mode: TravelMode; icon: SFSymbol; title: string }[] = [
  { mode: 'car', icon: 'car.fill', title: 'Авто' },
  { mode: 'bike', icon: 'bicycle', title: 'Вело' },
  { mode: 'foot', icon: 'figure.walk', title: 'Пешком' },
];

type Props = {
  stops: Place[];
  onRemoveStop: (index: number) => void;
  /** Opens search to pick an extra stop. */
  onAddStop: () => void;
  mode: TravelMode;
  onModeChange: (m: TravelMode) => void;
  routes: Route[];
  selected: number;
  onSelect: (i: number) => void;
  loading: boolean;
  error: string | null;
  canStart: boolean;
  onStart: () => void;
  onSimulate: () => void;
  onClose: () => void;
  onRetry: () => void;
  bottomInset: number;
};

export function RoutePanel(p: Props) {
  const { colors, s } = useThemed(makeStyles);
  const [showSteps, setShowSteps] = useState(false);
  const route = p.routes[p.selected];
  const now = useNow();

  return (
    <Sheet bottomInset={p.bottomInset}>
      <View style={s.header}>
        <View style={s.stops}>
          <StopRow icon="location.fill" color={colors.accent} title="Моё местоположение" />
          {p.stops.map((stop, i) => (
            <StopRow
              key={`${stop.id}-${i}`}
              icon={i === p.stops.length - 1 ? 'mappin' : 'flag.fill'}
              color={i === p.stops.length - 1 ? colors.red : colors.orange}
              title={stop.name}
              onRemove={p.stops.length > 1 ? () => p.onRemoveStop(i) : undefined}
            />
          ))}
          {p.stops.length < 4 ? (
            <Pressable onPress={() => (tap(), p.onAddStop())} style={s.stopRow} hitSlop={6}>
              <Icon name="plus.circle.fill" size={13} color={colors.accent} />
              <Text style={[s.stopText, { color: colors.accent }]}>Добавить остановку</Text>
            </Pressable>
          ) : null}
        </View>
        <CloseButton onPress={p.onClose} />
      </View>

      <View style={s.modes}>
        {MODES.map((m) => {
          const active = p.mode === m.mode;
          return (
            <Pressable key={m.mode} onPress={() => (tap(), p.onModeChange(m.mode))} style={[s.mode, active && s.modeActive]}>
              <Icon name={m.icon} size={15} color={active ? colors.text : colors.textSecondary} />
              <Text style={[s.modeText, active && { color: colors.text }]}>{m.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {p.loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={s.muted}>Строим маршрут</Text>
        </View>
      ) : p.error ? (
        <View style={s.center}>
          <Icon name="exclamationmark.triangle.fill" size={22} color={colors.orange} />
          <Text style={s.error}>{p.error}</Text>
          <Button title="Повторить" kind="secondary" compact onPress={p.onRetry} />
        </View>
      ) : showSteps && route ? (
        <ScrollView style={s.steps}>
          {route.steps
            .filter((st) => !st.silent)
            .map((st, i) => (
              <View key={i} style={s.stepRow}>
                <View style={s.stepIcon}>
                  <ManeuverArrow maneuver={st.maneuver} size={26} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepText}>{st.text}</Text>
                  <Text style={s.muted}>{formatDistance(st.along)} от начала</Text>
                </View>
              </View>
            ))}
        </ScrollView>
      ) : (
        <View style={{ gap: 8 }}>
          {p.routes.map((r, i) => {
            const active = i === p.selected;
            return (
              <Pressable key={r.id} onPress={() => (tap(), p.onSelect(i))} style={[s.option, active && s.optionActive]}>
                <View style={{ flex: 1 }}>
                  <View style={s.optionTop}>
                    <Text style={s.duration}>{formatDuration(r.duration)}</Text>
                    {i === 0 && p.routes.length > 1 ? (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>Быстрее</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.muted} numberOfLines={1}>
                    {formatDistance(r.distance)}
                    {r.summary ? ` · ${r.summary}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.etaLabel}>прибытие</Text>
                  <Text style={s.eta}>{formatClock(new Date(now + r.duration * 1000))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={s.actions}>
        <Button icon={showSteps ? 'list.bullet.rectangle.fill' : 'list.bullet'} kind="secondary" onPress={() => setShowSteps((v) => !v)} disabled={!route} />
        <Button icon="play.circle" kind="secondary" onPress={p.onSimulate} disabled={!route} />
        <Button title="Поехали" icon="location.north.fill" onPress={p.onStart} disabled={!route || !p.canStart} style={{ flex: 1 }} />
      </View>
      {!p.canStart && route ? <Text style={s.hint}>Ждём GPS. Пока можно запустить симуляцию ▷</Text> : null}
    </Sheet>
  );
}

function StopRow({ icon, color, title, onRemove }: { icon: SFSymbol; color: string; title: string; onRemove?: () => void }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <View style={s.stopRow}>
      <Icon name={icon} size={13} color={color} />
      <Text style={s.stopText} numberOfLines={1}>
        {title}
      </Text>
      {onRemove ? (
        <Pressable onPress={() => (tap(), onRemove())} hitSlop={10}>
          <Icon name="minus.circle.fill" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stops: { flex: 1, gap: 6 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopText: { color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 },
  modes: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: 3, marginVertical: 14 },
  mode: { flex: 1, height: 34, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  modeActive: { backgroundColor: colors.surfacePressed },
  modeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 18, gap: 10 },
  muted: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.text, fontSize: 15, textAlign: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 10,
  },
  optionActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  duration: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, ...font.number },
  badge: { backgroundColor: 'rgba(52,199,123,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  etaLabel: { color: colors.textTertiary, fontSize: 12 },
  eta: { color: colors.text, fontSize: 17, fontWeight: '600', ...font.number },
  steps: { maxHeight: 280 },
  stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.stroke },
  stepIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.maneuver, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  hint: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8 },
});
