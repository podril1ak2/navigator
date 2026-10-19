import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NetworkError, searchNearby, searchPlaces, type Category, type Place } from '../lib/api';
import { distance, formatDistance, type LatLng } from '../lib/geo';
import { colors, font, radius } from '../lib/theme';
import { useAppState } from '../state/AppState';
import { Icon, type SFSymbol } from './Icon';
import { IconBadge, tap } from './ui';

export const CATEGORIES: (Category & { icon: SFSymbol; color: string })[] = [
  { id: 'fuel', title: 'АЗС', icon: 'fuelpump.fill', color: '#2F9E6B', query: 'АЗС', osmTag: 'amenity:fuel' },
  { id: 'cafe', title: 'Кафе', icon: 'cup.and.saucer.fill', color: '#C47A2C', query: 'кафе', osmTag: 'amenity:cafe' },
  { id: 'food', title: 'Рестораны', icon: 'fork.knife', color: '#D9534F', query: 'ресторан', osmTag: 'amenity:restaurant' },
  { id: 'grocery', title: 'Продукты', icon: 'cart.fill', color: '#3C8DDE', query: 'супермаркет', osmTag: 'shop:supermarket' },
  { id: 'pharmacy', title: 'Аптеки', icon: 'cross.case.fill', color: '#2BB673', query: 'аптека', osmTag: 'amenity:pharmacy' },
  { id: 'atm', title: 'Банкоматы', icon: 'banknote.fill', color: '#6C63FF', query: 'банкомат', osmTag: 'amenity:atm' },
  { id: 'parking', title: 'Парковки', icon: 'parkingsign', color: '#4B6BFF', query: 'парковка', osmTag: 'amenity:parking' },
  { id: 'charging', title: 'Зарядки', icon: 'bolt.car.fill', color: '#18A999', query: 'зарядная станция', osmTag: 'amenity:charging_station' },
  { id: 'carwash', title: 'Мойки', icon: 'drop.fill', color: '#2D9CDB', query: 'автомойка', osmTag: 'amenity:car_wash' },
  { id: 'hotel', title: 'Отели', icon: 'bed.double.fill', color: '#9B59B6', query: 'отель', osmTag: 'tourism:hotel' },
];

type Props = {
  topInset: number;
  near: LatLng | null;
  online: boolean;
  onClose: () => void;
  onPick: (place: Place) => void;
  onCategoryResults: (title: string, places: Place[]) => void;
};

export function SearchOverlay({ topInset, near, online, onClose, onPick, onCategoryResults }: Props) {
  const { recents, clearRecents, favorites } = useAppState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ ctrl: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);

  const cancelPending = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current.ctrl.abort();
    pending.current = null;
  };
  useEffect(() => cancelPending, []);

  const searchOffline = (q: string) => {
    const needle = q.toLowerCase();
    const pool = [...favorites, ...recents.filter((r) => !favorites.some((f) => f.id === r.id))];
    return pool.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(needle));
  };

  const onChangeQuery = (text: string) => {
    setQuery(text);
    cancelPending();
    setError(null);
    const q = text.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    if (!online) {
      setResults(searchOffline(q));
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(q, near ?? undefined, ctrl.signal)
        .then(setResults)
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          if (e instanceof NetworkError) {
            setResults(searchOffline(q));
            setError('Нет связи с поиском — показываю сохранённые места');
          } else setError('Не удалось выполнить поиск');
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 300);
    pending.current = { ctrl, timer };
  };

  const runCategory = async (cat: (typeof CATEGORIES)[number]) => {
    if (!near) {
      setError('Нужна геолокация, чтобы искать рядом');
      return;
    }
    if (!online) {
      setError('Поиск по категориям недоступен без интернета');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      const places = await searchNearby(cat, near);
      if (places.length === 0) setError(`Рядом ничего не нашлось: ${cat.title.toLowerCase()}`);
      else onCategoryResults(cat.title, places);
    } catch {
      setError('Нет соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const showingRecents = results === null;
  const list = results ?? recents;

  return (
    <View style={[s.root, { paddingTop: topInset + 8 }]}>
      <View style={s.searchRow}>
        <View style={s.inputWrap}>
          <Icon name="magnifyingglass" size={16} color={colors.textSecondary} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={onChangeQuery}
            placeholder={online ? 'Адрес, место или организация' : 'Поиск по сохранённым местам'}
            placeholderTextColor={colors.textTertiary}
            style={s.input}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            keyboardAppearance="dark"
          />
          {loading ? <ActivityIndicator color={colors.textSecondary} size="small" /> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={s.cancel}>Отмена</Text>
        </Pressable>
      </View>

      {!online ? (
        <View style={s.offline}>
          <Icon name="wifi.slash" size={13} color={colors.textSecondary} />
          <Text style={s.offlineText}>Нет интернета. Доступны избранное, история и скачанные карты.</Text>
        </View>
      ) : null}

      {showingRecents ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats} keyboardShouldPersistTaps="handled">
          {CATEGORIES.map((c) => (
            <Pressable key={c.id} onPress={() => (tap(), runCategory(c))} style={({ pressed }) => [s.cat, pressed && { opacity: 0.6 }]}>
              <IconBadge icon={c.icon} color={c.color} size={48} />
              <Text style={s.catText} numberOfLines={1}>
                {c.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          showingRecents && recents.length > 0 ? (
            <View style={s.sectionRow}>
              <Text style={s.section}>Недавние</Text>
              <Pressable onPress={clearRecents} hitSlop={8}>
                <Text style={s.clear}>Очистить</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && results !== null ? <Text style={s.empty}>Ничего не найдено</Text> : null
        }
        ItemSeparatorComponent={() => <View style={s.sep} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => (tap(), onPick(item))} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceRaised }]}>
            <View style={s.rowIcon}>
              <Icon name={showingRecents ? 'clock.arrow.circlepath' : 'mappin'} size={15} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {[item.category, item.address].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {near ? <Text style={s.rowDist}>{formatDistance(distance(near, item.coordinate))}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, color: colors.text, fontSize: 17 },
  cancel: { color: colors.accent, fontSize: 17 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12 },
  offlineText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  cats: { paddingHorizontal: 12, paddingVertical: 16, gap: 4 },
  cat: { width: 72, alignItems: 'center', gap: 6 },
  catText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  error: { color: colors.orange, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  section: { ...font.caption, color: colors.textTertiary, textTransform: 'uppercase' },
  clear: { color: colors.accent, fontSize: 14 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.stroke, marginLeft: 62 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 14 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
  rowSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  rowDist: { color: colors.textTertiary, fontSize: 13, ...font.number },
});
