import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNow } from '../hooks/useNow';
import type { Place } from '../lib/api';
import { distance, formatCoords, formatDistance, type LatLng } from '../lib/geo';
import { DAY_SHORT_RU, hoursStatus, parseOpeningHours, weekLines } from '../lib/hours';
import { fetchPhotos, fetchPlaceDetails, hasStreetPhotos, type Photo, type PlaceDetails, type SocialLink } from '../lib/places';
import { font, radius, useThemed, type Palette } from '../lib/theme';
import { useAppState } from '../state/AppState';
import { Icon, type SFSymbol } from './Icon';
import { CloseButton, Sheet, tap } from './ui';

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

const SOCIAL: Record<SocialLink['kind'], { title: string; color: string }> = {
  vk: { title: 'VK', color: '#0077FF' },
  telegram: { title: 'Telegram', color: '#229ED9' },
  ok: { title: 'OK', color: '#EE8208' },
  instagram: { title: 'Instagram', color: '#D6297A' },
  facebook: { title: 'Facebook', color: '#1877F2' },
  youtube: { title: 'YouTube', color: '#E62117' },
  whatsapp: { title: 'WhatsApp', color: '#25D366' },
};

const OSM_TYPE: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

/** Render with `key={place.id}` so details reset per place. */
export function PlaceCard({ place, near, bottomInset, loading, online, onRoute, onAddStop, onClose, pager }: Props) {
  const { colors, s } = useThemed(makeStyles);
  const { height } = useWindowDimensions();
  const { isFavorite, toggleFavorite, setLabeled, favorites } = useAppState();
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [detailsDone, setDetailsDone] = useState(!place.osmRef);
  const [weekOpen, setWeekOpen] = useState(false);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const now = useNow(60000);
  const fav = isFavorite(place.id);
  const label = favorites.find((f) => f.id === place.id)?.label;

  useEffect(() => {
    if (!place.osmRef || !online) return;
    const ctrl = new AbortController();
    fetchPlaceDetails(place.osmRef, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setDetails(d);
        return fetchPhotos(d, place.coordinate, ctrl.signal).then((p) => !ctrl.signal.aborted && setPhotos(p));
      })
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setDetailsDone(true));
    return () => ctrl.abort();
  }, [place.osmRef, place.coordinate, online]);

  const week = details?.openingHours ? parseOpeningHours(details.openingHours) : null;
  const status = week ? hoursStatus(week, new Date(now)) : null;
  const today = (new Date(now).getDay() + 6) % 7;

  const share = () => {
    const { latitude, longitude } = place.coordinate;
    const lines = [place.name, details?.address ?? place.address, details?.phones[0], formatCoords(place.coordinate), `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`];
    Share.share({ message: lines.filter(Boolean).join('\n') }).catch(() => {});
  };

  const call = () => details?.phones[0] && Linking.openURL(`tel:${details.phones[0].replace(/[^\d+]/g, '')}`);
  const site = () => details?.website && Linking.openURL(details.website);
  const editUrl = place.osmRef ? `https://www.openstreetmap.org/edit?${OSM_TYPE[place.osmRef[0]]}=${place.osmRef.slice(1)}` : null;

  const subtitle = [place.category, near ? formatDistance(distance(near, place.coordinate)) : null].filter(Boolean).join(' · ');
  const address = details?.address || place.address;
  const hasInfo = !!details && (details.phones.length || details.website || details.openingHours || details.social.length || details.features.length || details.email);

  return (
    <Sheet bottomInset={bottomInset}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>
            {loading ? 'Определяем адрес…' : place.name}
          </Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          {status ? (
            <Text style={[s.status, { color: status.open ? (status.soon ? colors.orange : colors.green) : colors.red }]}>{status.label}</Text>
          ) : null}
        </View>
        <CloseButton onPress={onClose} />
      </View>

      <ScrollView style={{ maxHeight: height * 0.58 }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos} style={s.photosWrap}>
            {photos.map((p) => (
              <Pressable key={p.url} onPress={() => (tap(), setViewer(p))}>
                <View style={[s.photo, p.kind === 'logo' && s.logo]}>
                  <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} resizeMode={p.kind === 'logo' ? 'contain' : 'cover'} />
                  {p.kind === 'brand' || p.kind === 'street' ? (
                    <View style={s.photoBadge}>
                      <Text style={s.photoBadgeText}>{p.kind === 'brand' ? 'Фото сети' : 'С улицы'}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={s.actions}>
          <Action icon="arrow.triangle.turn.up.right.diamond.fill" title={onAddStop ? 'Сюда' : 'Маршрут'} primary onPress={onRoute} />
          {onAddStop ? <Action icon="plus" title="Заехать" onPress={onAddStop} /> : null}
          {details?.phones.length ? <Action icon="phone.fill" title="Позвонить" onPress={call} /> : null}
          {details?.website ? <Action icon="safari.fill" title="Сайт" onPress={site} /> : null}
          <Action icon={fav ? 'bookmark.fill' : 'bookmark'} title={fav ? 'Сохранено' : 'Сохранить'} onPress={() => toggleFavorite(place)} active={fav} />
          <Action icon="square.and.arrow.up" title="Поделиться" onPress={share} />
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

        <View style={s.group}>
          {address ? <InfoRow icon="mappin.and.ellipse" text={address} first /> : null}
          {details?.openingHours ? (
            <>
              <InfoRow
                icon="clock"
                first={!address}
                text={status ? status.label : details.openingHours}
                tint={status ? (status.open ? colors.green : colors.red) : undefined}
                right={week ? <Icon name={weekOpen ? 'chevron.up' : 'chevron.down'} size={12} color={colors.textTertiary} /> : undefined}
                onPress={week ? () => setWeekOpen((v) => !v) : undefined}
              />
              {weekOpen && week ? (
                <View style={s.week}>
                  {weekLines(week).map((line, i) => (
                    <View key={i} style={s.weekRow}>
                      <Text style={[s.weekDay, i === today && s.weekToday]}>{DAY_SHORT_RU[i]}</Text>
                      <Text style={[s.weekText, i === today && s.weekToday]}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          {details?.phones.map((p) => (
            <InfoRow key={p} icon="phone" text={p} link onPress={() => Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`)} />
          ))}
          {details?.website ? (
            <InfoRow icon="globe" text={details.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} link onPress={site} />
          ) : null}
          {details?.email ? <InfoRow icon="envelope" text={details.email} link onPress={() => Linking.openURL(`mailto:${details.email}`)} /> : null}
          {details?.cuisine ? <InfoRow icon="fork.knife" text={`Кухня: ${details.cuisine}`} /> : null}
          {details?.brand && details.brand !== place.name ? <InfoRow icon="tag" text={`Сеть: ${details.brand}`} /> : null}
          {details?.operator && details.operator !== details.brand ? <InfoRow icon="building.2" text={details.operator} /> : null}
          {!detailsDone && online ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={s.loadingText}>Загружаем подробности</Text>
            </View>
          ) : null}
        </View>

        {details?.social.length ? (
          <View style={s.chips}>
            {details.social.map((l) => (
              <Pressable key={l.url} onPress={() => (tap(), Linking.openURL(l.url))} style={[s.social, { backgroundColor: SOCIAL[l.kind].color }]}>
                <Text style={s.socialText}>{SOCIAL[l.kind].title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {details?.features.length ? (
          <View style={s.chips}>
            {details.features.map((f) => (
              <View key={f} style={s.feature}>
                <Icon name="checkmark" size={11} color={colors.green} weight="bold" />
                <Text style={s.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {details?.description ? <Text style={s.description}>{details.description}</Text> : null}

        {detailsDone && place.osmRef && !hasInfo ? (
          <Text style={s.empty}>Контактов и часов работы для этого места пока нет в OpenStreetMap.</Text>
        ) : null}

        <View style={s.labels}>
          <LabelButton icon="house.fill" active={label === 'home'} title={label === 'home' ? 'Дом' : 'Сделать домом'} onPress={() => setLabeled('home', place)} />
          <LabelButton icon="briefcase.fill" active={label === 'work'} title={label === 'work' ? 'Работа' : 'Сделать работой'} onPress={() => setLabeled('work', place)} />
        </View>

        <Text style={s.attribution}>
          Данные © OpenStreetMap
          {photos.some((p) => p.source === 'Wikimedia Commons') ? ' · Фото: Wikimedia Commons' : ''}
          {photos.some((p) => p.source === 'Mapillary') ? ' · Mapillary' : ''}
          {editUrl ? (
            <Text style={s.attributionLink} onPress={() => Linking.openURL(editUrl)}>
              {'  '}Дополнить
            </Text>
          ) : null}
        </Text>
        {!hasStreetPhotos && __DEV__ ? <Text style={s.devHint}>Уличные фото: добавьте EXPO_PUBLIC_MAPILLARY_TOKEN</Text> : null}
      </ScrollView>

      <PhotoViewer photo={viewer} onClose={() => setViewer(null)} />
    </Sheet>
  );
}

function Action({ icon, title, onPress, primary, active }: { icon: SFSymbol; title: string; onPress: () => void; primary?: boolean; active?: boolean }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}>
      <View style={[s.actionIcon, primary && { backgroundColor: colors.accent }]}>
        <Icon name={icon} size={19} color={primary ? colors.onAccent : active ? colors.accent : colors.text} />
      </View>
      <Text style={[s.actionText, primary && { color: colors.accent }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

function InfoRow({
  icon,
  text,
  onPress,
  link,
  tint,
  right,
  first,
}: {
  icon: SFSymbol;
  text: string;
  onPress?: () => void;
  link?: boolean;
  tint?: string;
  right?: React.ReactNode;
  first?: boolean;
}) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable disabled={!onPress} onPress={() => (tap(), onPress?.())} style={({ pressed }) => [s.infoRow, !first && s.infoDivider, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={16} color={colors.textSecondary} />
      <Text style={[s.infoText, link && { color: colors.accent }, tint && { color: tint }]} numberOfLines={3}>
        {text}
      </Text>
      {right}
    </Pressable>
  );
}

function LabelButton({ icon, title, active, onPress }: { icon: SFSymbol; title: string; active: boolean; onPress: () => void }) {
  const { colors, s } = useThemed(makeStyles);
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [s.label, active && { backgroundColor: colors.accentDim }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={13} color={active ? colors.accent : colors.textSecondary} />
      <Text style={[s.labelText, active && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const { s } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.viewer}>
        {photo ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
        <Pressable onPress={onClose} hitSlop={16} style={[s.viewerClose, { top: insets.top + 12 }]}>
          <Icon name="xmark" size={16} color="#FFFFFF" weight="bold" />
        </Pressable>
        {photo ? (
          <Text style={[s.viewerCaption, { bottom: insets.bottom + 16 }]}>
            {photo.kind === 'brand' ? 'Фото сети, не обязательно этого места · ' : photo.kind === 'street' ? 'Уличное фото рядом · ' : ''}
            {photo.source}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    title: { ...font.title, color: colors.text },
    subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 3 },
    status: { fontSize: 14, fontWeight: '600', marginTop: 4 },
    photosWrap: { marginHorizontal: -16, marginBottom: 14 },
    photos: { paddingHorizontal: 16, gap: 8 },
    photo: { width: 210, height: 140, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    logo: { width: 140, backgroundColor: '#FFFFFF' },
    photoBadge: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    photoBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
    actions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    action: { flex: 1, alignItems: 'center', gap: 5 },
    actionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 12 },
    pagerText: { color: colors.textSecondary, fontSize: 14, ...font.number },
    dim: { opacity: 0.3 },
    group: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    infoDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.stroke },
    infoText: { color: colors.text, fontSize: 15, flex: 1 },
    week: { paddingLeft: 28, paddingBottom: 10, gap: 4 },
    weekRow: { flexDirection: 'row', gap: 12 },
    weekDay: { color: colors.textSecondary, fontSize: 14, width: 26 },
    weekText: { color: colors.textSecondary, fontSize: 14, ...font.number },
    weekToday: { color: colors.text, fontWeight: '600' },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    loadingText: { color: colors.textSecondary, fontSize: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    social: { borderRadius: 8, paddingHorizontal: 11, height: 30, justifyContent: 'center' },
    socialText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    feature: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, height: 30, backgroundColor: colors.surfaceRaised },
    featureText: { color: colors.text, fontSize: 13, fontWeight: '500' },
    description: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },
    empty: { color: colors.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 12 },
    labels: { flexDirection: 'row', gap: 8, marginTop: 14 },
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
    labelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    attribution: { color: colors.textTertiary, fontSize: 11, marginTop: 14, textAlign: 'center' },
    attributionLink: { color: colors.accent, fontWeight: '600' },
    devHint: { color: colors.textTertiary, fontSize: 10, marginTop: 4, textAlign: 'center' },
    viewer: { flex: 1, backgroundColor: '#000000' },
    viewerClose: {
      position: 'absolute',
      right: 16,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerCaption: { position: 'absolute', left: 16, right: 16, color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },
  });
