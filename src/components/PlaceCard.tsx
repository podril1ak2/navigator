import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { placeDetails, type Place, type PlaceDetails } from '../lib/api';
import { distance, formatCoords, formatDistance, type LatLng } from '../lib/geo';
import { colors, font, radius } from '../lib/theme';
import { useAppState } from '../state/AppState';
import { Icon, type SFSymbol } from './Icon';
import { Button, CloseButton, Sheet, tap } from './ui';

type Props = {
  place: Place;
  near: LatLng | null;
  bottomInset: number;
  loading?: boolean;
  online: boolean;
  onRoute: () => void;
  /** Present while a route is being planned: add this place as a stop. */
  onAddStop?: () => void;
  onClose: () => void;
  pager?: { index: number; total: number; onPrev: () => void; onNext: () => void };
};

/** Render with `key={place.id}` so details reset per place. */
export function PlaceCard({ place, near, bottomInset, loading, online, onRoute, onAddStop, onClose, pager }: Props) {
  const { isFavorite, toggleFavorite, setLabeled, favorites } = useAppState();
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const fav = isFavorite(place.id);
  const label = favorites.find((f) => f.id === place.id)?.label;

  useEffect(() => {
    if (!place.osmRef || !online) return;
    const ctrl = new AbortController();
    placeDetails(place.osmRef, ctrl.signal)
      .then((d) => !ctrl.signal.aborted && setDetails(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [place.osmRef, online]);

  const share = () => {
    const { latitude, longitude } = place.coordinate;
    Share.share({
      message: `${place.name}${place.address ? `, ${place.address}` : ''}\n${formatCoords(place.coordinate)}\nhttps://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`,
    }).catch(() => {});
  };

  const meta = [place.category, near ? formatDistance(distance(near, place.coordinate)) : null].filter(Boolean).join(' · ');

  return (
    <Sheet bottomInset={bottomInset}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>
            {loading ? 'Определяем адрес…' : place.name}
          </Text>
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
          {place.address ? (
            <Text style={s.address} numberOfLines={2}>
              {place.address}
            </Text>
          ) : null}
        </View>
        <CloseButton onPress={onClose} />
      </View>

      {pager ? (
        <View style={s.pager}>
          <Pressable onPress={pager.onPrev} hitSlop={10} disabled={pager.index === 0} style={pager.index === 0 && s.dim}>
            <Icon name="chevron.left" size={16} color={colors.accent} />
          </Pressable>
          <Text style={s.pagerText}>
            {pager.index + 1} из {pager.total}
          </Text>
          <Pressable onPress={pager.onNext} hitSlop={10} disabled={pager.index >= pager.total - 1} style={pager.index >= pager.total - 1 && s.dim}>
            <Icon name="chevron.right" size={16} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}

      <View style={s.actions}>
        <Button title={onAddStop ? 'Сюда' : 'Маршрут'} icon="arrow.triangle.turn.up.right.diamond.fill" onPress={onRoute} style={{ flex: 1 }} />
        {onAddStop ? <Button title="Заехать" icon="plus" kind="secondary" onPress={onAddStop} style={{ flex: 1 }} /> : null}
        <Button icon={fav ? 'star.fill' : 'star'} kind="secondary" onPress={() => toggleFavorite(place)} />
        <Button icon="square.and.arrow.up" kind="secondary" onPress={share} />
      </View>

      {details && (details.openingHours || details.phone || details.website) ? (
        <View style={s.details}>
          {details.openingHours ? <DetailRow icon="clock" text={humanHours(details.openingHours)} /> : null}
          {details.phone ? (
            <DetailRow icon="phone.fill" text={details.phone} onPress={() => Linking.openURL(`tel:${details.phone!.replace(/[^\d+]/g, '')}`)} />
          ) : null}
          {details.website ? (
            <DetailRow icon="safari" text={details.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} onPress={() => Linking.openURL(details.website!)} />
          ) : null}
        </View>
      ) : null}

      <View style={s.labels}>
        <LabelButton icon="house.fill" active={label === 'home'} title={label === 'home' ? 'Дом' : 'Сделать домом'} onPress={() => setLabeled('home', place)} />
        <LabelButton icon="briefcase.fill" active={label === 'work'} title={label === 'work' ? 'Работа' : 'Сделать работой'} onPress={() => setLabeled('work', place)} />
      </View>
    </Sheet>
  );
}

function DetailRow({ icon, text, onPress }: { icon: SFSymbol; text: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={() => (tap(), onPress?.())} style={({ pressed }) => [s.detailRow, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={15} color={colors.textSecondary} />
      <Text style={[s.detailText, onPress && { color: colors.accent }]} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

function LabelButton({ icon, title, active, onPress }: { icon: SFSymbol; title: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [s.label, active && s.labelActive, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={13} color={active ? colors.green : colors.textSecondary} />
      <Text style={[s.labelText, active && { color: colors.green }]}>{title}</Text>
    </Pressable>
  );
}

const DAYS: Record<string, string> = { Mo: 'Пн', Tu: 'Вт', We: 'Ср', Th: 'Чт', Fr: 'Пт', Sa: 'Сб', Su: 'Вс', PH: 'праздники' };

/** Light localization of OSM opening_hours ("Mo-Fr 09:00-21:00; Sa off"). */
export function humanHours(v: string): string {
  if (v.trim() === '24/7') return 'Круглосуточно';
  return v
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
    .replace(/\boff\b/g, 'выходной')
    .replace(/;\s*/g, ' · ');
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { ...font.title, color: colors.text },
  meta: { color: colors.textSecondary, fontSize: 15, marginTop: 3 },
  address: { color: colors.textTertiary, fontSize: 14, marginTop: 2 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 12 },
  pagerText: { color: colors.textSecondary, fontSize: 14, ...font.number },
  dim: { opacity: 0.3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  details: { marginTop: 14, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: 12 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  detailText: { color: colors.text, fontSize: 15, flex: 1 },
  labels: { flexDirection: 'row', gap: 8, marginTop: 12 },
  label: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  labelActive: { backgroundColor: 'rgba(52,199,123,0.14)' },
  labelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
