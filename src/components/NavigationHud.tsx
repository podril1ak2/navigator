import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { type Palette, font, radius, useThemed } from '../lib/theme';
import type { TripSnapshot } from '../positioning/controller';
import type { SimInterference } from '../positioning/simulator';
import { Icon } from './Icon';
import { LaneGuide, ManeuverArrow } from './ManeuverArrow';
import { Glass, tap } from './ui';

/** Splits "1,2 км" into value and unit for the big banner number. */
function splitDistance(m: number): [string, string] {
  const s = formatDistance(m);
  const i = s.lastIndexOf(' ');
  return [s.slice(0, i), s.slice(i + 1)];
}

/** `children` (status pills) are stacked under the banner so they never overlap it. */
export function ManeuverBanner({
  trip,
  topInset,
  rerouting,
  children,
  right,
}: {
  trip: TripSnapshot;
  topInset: number;
  rerouting: boolean;
  children?: ReactNode;
  /** Shown at the right under the banner (speed and limit). */
  right?: ReactNode;
}) {
  const { colors, s } = useThemed(makeStyles);
  const p = trip.progress;
  const next = p?.next;
  const [value, unit] = splitDistance(p?.distanceToNext ?? 0);
  const showLanes = !!next?.lanes.length && (p?.distanceToNext ?? Infinity) < 600;
  const showThen = !!p?.then && !!next && p.then.along - next.along < 300 && !rerouting;

  return (
    <View style={[s.bannerWrap, { paddingTop: topInset + 6 }]} pointerEvents="box-none">
      <View style={s.banner}>
        {rerouting || !p || !next ? (
          <View style={s.bannerRow}>
            <Icon name={rerouting ? 'arrow.triangle.2.circlepath' : 'location.magnifyingglass'} size={30} color={colors.onAccent} />
            <Text style={s.bannerStatus}>{rerouting ? 'Перестраиваем маршрут' : 'Ищем вас на маршруте'}</Text>
          </View>
        ) : (
          <View style={s.bannerRow}>
            <ManeuverArrow maneuver={next.maneuver} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={s.distance}>
                {value}
                <Text style={s.unit}> {unit}</Text>
              </Text>
              <Text style={s.street} numberOfLines={2}>
                {next.street || next.text}
              </Text>
            </View>
          </View>
        )}
        {showLanes && next ? (
          <View style={s.lanes}>
            <LaneGuide lanes={next.lanes} />
          </View>
        ) : null}
      </View>
      {showThen && p?.then ? (
        <View style={s.then}>
          <Text style={s.thenText}>Затем</Text>
          <ManeuverArrow maneuver={p.then.maneuver} size={22} />
        </View>
      ) : null}
      <View style={s.belowRow} pointerEvents="box-none">
        <View style={s.below} pointerEvents="box-none">
          {children}
        </View>
        {right}
      </View>
    </View>
  );
}

/** GPS / network status pill. Hidden when everything is fine. */
export function SignalPill({ trip, online, navigating }: { trip: TripSnapshot; online: boolean; navigating: boolean }) {
  const { colors, s } = useThemed(makeStyles);
  let icon: 'location.slash.fill' | 'exclamationmark.triangle.fill' | 'location.fill' | 'wifi.slash' | null = null;
  let text = '';
  let tint: string = colors.orange;
  const src = trip.position?.source;
  if (trip.signal === 'spoofed') {
    icon = 'exclamationmark.triangle.fill';
    text = src === 'dr' ? 'Подмена GPS · ведём по счислению' : 'Подмена GPS · сигнал игнорируется';
    tint = colors.red;
  } else if (trip.signal === 'lost') {
    icon = 'location.slash.fill';
    text = src === 'dr' ? `Нет GPS · по счислению ${formatSeconds(trip.drSeconds)}` : navigating ? 'Нет сигнала GPS' : 'Ищем GPS…';
  } else if (trip.signal === 'weak') {
    icon = 'location.fill';
    text = `Слабый GPS · ±${Math.round(trip.position?.accuracy ?? 0)} м`;
    tint = colors.yellow;
  } else if (!online) {
    icon = 'wifi.slash';
    text = navigating ? 'Нет интернета · маршрут сохранён' : 'Нет интернета';
    tint = colors.textSecondary;
  }
  if (!icon) return null;
  return (
    <Glass radius={16} style={s.pill}>
      <View style={s.pillRow}>
        <Icon name={icon} size={13} color={tint} />
        <Text style={s.pillText} numberOfLines={1}>
          {text}
        </Text>
        {!online && trip.signal !== 'good' ? <Icon name="wifi.slash" size={12} color={colors.textSecondary} /> : null}
      </View>
    </Glass>
  );
}

function formatSeconds(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CameraAlert({ trip }: { trip: TripSnapshot }) {
  const { colors, s } = useThemed(makeStyles);
  const cam = trip.nextCamera;
  if (!cam || cam.distance > 700) return null;
  return (
    <Glass radius={16} style={s.pill}>
      <View style={s.pillRow}>
        <Icon name="camera.fill" size={13} color={colors.red} />
        <Text style={s.pillText}>
          Камера через {formatDistance(cam.distance)}
          {cam.camera.limit ? ` · ${cam.camera.limit}` : ''}
        </Text>
      </View>
    </Glass>
  );
}

export function SpeedCluster({ trip, show }: { trip: TripSnapshot; show: boolean }) {
  const { colors, s } = useThemed(makeStyles);
  const speed = trip.position?.source === 'gps' && trip.position.speed != null ? trip.position.speed * 3.6 : null;
  if (!show || (speed == null && trip.speedLimit == null)) return null;
  return (
    <View style={s.speedCluster}>
      {speed != null ? (
        <Glass radius={30} style={[s.speed, trip.overSpeed && { borderColor: colors.red, borderWidth: 2 }]}>
          <View style={s.speedInner}>
            <Text style={[s.speedValue, trip.overSpeed && { color: colors.red }]}>{Math.round(speed)}</Text>
            <Text style={s.speedUnit}>км/ч</Text>
          </View>
        </Glass>
      ) : null}
      {trip.speedLimit != null ? (
        <View style={s.limit}>
          <Text style={s.limitText}>{trip.speedLimit}</Text>
        </View>
      ) : null}
    </View>
  );
}

type FooterProps = {
  trip: TripSnapshot;
  totalDistance: number;
  bottomInset: number;
  voice: boolean;
  onToggleVoice: () => void;
  onOverview: () => void;
  onEnd: () => void;
};

export function NavFooter({ trip, totalDistance, bottomInset, voice, onToggleVoice, onOverview, onEnd }: FooterProps) {
  const { colors, s } = useThemed(makeStyles);
  const now = useNow();
  const p = trip.progress;
  const remaining = p?.remainingDuration ?? 0;
  const done = p ? 1 - p.remainingDistance / (totalDistance || 1) : 0;
  return (
    <View style={[s.footerWrap, { paddingBottom: Math.max(bottomInset - 8, 8) }]} pointerEvents="box-none">
      <Glass radius={22}>
        <View style={s.footerRow}>
          <Pressable onPress={() => (tap(), onToggleVoice())} style={s.footerBtn} hitSlop={8} accessibilityLabel="Звук">
            <Icon name={voice ? 'speaker.wave.2.fill' : 'speaker.slash.fill'} size={17} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => (tap(), onOverview())} style={s.footerStats} accessibilityLabel="Обзор маршрута">
            <View style={s.statsRow}>
              <Text style={s.stat}>{p ? formatDistance(p.remainingDistance) : '—'}</Text>
              <Text style={s.eta}>{p ? formatClock(new Date(now + remaining * 1000)) : '—'}</Text>
              <Text style={[s.stat, { textAlign: 'right' }]}>{p ? formatDuration(remaining) : '—'}</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.max(0, Math.min(1, done)) * 100}%` }]} />
            </View>
          </Pressable>
          <Pressable onPress={() => (tap(), onEnd())} style={s.footerBtn} hitSlop={8} accessibilityLabel="Завершить">
            <Icon name="xmark" size={16} color={colors.text} weight="bold" />
          </Pressable>
        </View>
      </Glass>
    </View>
  );
}

const SIM_OPTIONS: { value: SimInterference; title: string; icon: 'checkmark.circle' | 'antenna.radiowaves.left.and.right.slash' | 'exclamationmark.triangle' }[] = [
  { value: 'none', title: 'Норма', icon: 'checkmark.circle' },
  { value: 'jam', title: 'Глушение', icon: 'antenna.radiowaves.left.and.right.slash' },
  { value: 'spoof', title: 'Подмена', icon: 'exclamationmark.triangle' },
];

export function SimulationBar({ value, onChange }: { value: SimInterference; onChange: (v: SimInterference) => void }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Glass radius={radius.md} style={s.sim}>
      <View style={s.simRow}>
        <Text style={s.simLabel}>СИМУЛЯЦИЯ</Text>
        {SIM_OPTIONS.map((o) => (
          <Pressable key={o.value} onPress={() => (tap(), onChange(o.value))} style={[s.simBtn, value === o.value && s.simBtnActive]}>
            <Icon name={o.icon} size={13} color={value === o.value ? colors.text : colors.textSecondary} />
            <Text style={[s.simBtnText, value === o.value && { color: colors.text }]}>{o.title}</Text>
          </Pressable>
        ))}
      </View>
    </Glass>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 8 },
  banner: {
    backgroundColor: colors.maneuver,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  bannerStatus: { ...font.headline, color: colors.onAccent, flex: 1 },
  distance: { color: colors.onAccent, fontSize: 34, fontWeight: '700', letterSpacing: -0.8, ...font.number },
  unit: { fontSize: 19, fontWeight: '600', color: 'rgba(255,255,255,0.72)' },
  street: { color: colors.onAccent, fontSize: 17, fontWeight: '600', marginTop: -3 },
  lanes: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  then: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginLeft: 10,
    backgroundColor: colors.maneuverLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  thenText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  below: { flex: 1, gap: 6, alignItems: 'flex-start' },
  belowRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginHorizontal: 4, gap: 8 },
  footerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10 },
  footerStats: { flex: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  stat: { color: colors.text, fontSize: 16, fontWeight: '600', minWidth: 74, ...font.number },
  pill: { alignSelf: 'flex-start' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  speedCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speed: { width: 60, height: 60 },
  speedInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  speedValue: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 24, ...font.number },
  speedUnit: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
  limit: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: '#E5322D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: { color: '#111111', fontSize: 18, fontWeight: '800', ...font.number },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.stroke, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.green },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8 },
  footerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eta: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, ...font.number },
  sim: { alignSelf: 'center' },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  simLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginHorizontal: 8 },
  simBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 9 },
  simBtnActive: { backgroundColor: colors.surfacePressed },
  simBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
