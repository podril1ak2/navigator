import { OfflineManager, type LngLatBounds, type OfflinePack, type OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Row, Section } from '../components/List';
import { useThemed, type Palette } from '../lib/theme';
import { LIBERTY_STYLE_URL } from '../map/style';
import { useTrip, useTripSnapshot } from '../positioning/TripProvider';

type Preset = { id: string; name: string; description: string; bounds: LngLatBounds; maxZoom: number };

const PRESETS: Preset[] = [
  { id: 'msk', name: 'Москва в пределах МКАД', description: 'Все улицы и дома', bounds: [37.35, 55.56, 37.87, 55.92], maxZoom: 14 },
  { id: 'msk-region', name: 'Москва и область', description: 'Обзорно: трассы, города, крупные улицы', bounds: [35.1, 54.2, 40.25, 56.98], maxZoom: 11 },
  { id: 'spb', name: 'Санкт-Петербург в пределах КАД', description: 'Все улицы и дома', bounds: [30.1, 59.8, 30.56, 60.09], maxZoom: 14 },
];

// Vector tiles exist up to z14; MapLibre overzooms them, so z14 is full detail.
const MIN_ZOOM = 0;

type PackRow = { pack: OfflinePack; status: OfflinePackStatus | null; name: string };

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  return `${(b / 1024 / 1024).toFixed(b < 100 * 1024 * 1024 ? 1 : 0).replace('.', ',')} МБ`;
}

export default function OfflineScreen() {
  const { colors, s: st } = useThemed(makeStyles);
  const { online } = useTrip();
  const trip = useTripSnapshot();
  const [packs, setPacks] = useState<PackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await OfflineManager.getPacks();
      const rows = await Promise.all(
        list.map(async (pack) => ({
          pack,
          status: await pack.status().catch(() => null),
          name: String(pack.metadata?.name ?? 'Район'),
        })),
      );
      setPacks(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать офлайн-карты');
      setPacks([]);
    }
  }, []);

  useEffect(() => {
    OfflineManager.setTileCountLimit(250000);
    OfflineManager.setProgressEventThrottle(500);
    // Initial load; reload() only sets state after awaiting native calls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const onProgress = (pack: OfflinePack, status: OfflinePackStatus) => {
    setPacks((prev) => (prev ?? []).map((r) => (r.pack.id === pack.id ? { ...r, status } : r)));
  };

  const download = async (name: string, bounds: LngLatBounds, maxZoom: number) => {
    if (!online) {
      Alert.alert('Нет интернета', 'Скачать карты можно только при подключении к сети.');
      return;
    }
    if (packs?.some((p) => p.name === name)) {
      Alert.alert('Уже скачано', name);
      return;
    }
    try {
      setError(null);
      const pack = await OfflineManager.createPack(
        { mapStyle: LIBERTY_STYLE_URL, bounds, minZoom: MIN_ZOOM, maxZoom, metadata: { name } },
        onProgress,
        (_p, err) => setError(err.message),
      );
      setPacks((prev) => [...(prev ?? []), { pack, status: null, name }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать загрузку');
    }
  };

  const downloadAroundMe = () => {
    const c = trip.position?.coordinate;
    if (!c) {
      Alert.alert('Нет местоположения', 'Дождитесь, пока навигатор определит, где вы.');
      return;
    }
    // ~12 km in each direction.
    const dLat = 0.11;
    const dLon = dLat / Math.cos((c.latitude * Math.PI) / 180);
    download(`Вокруг ${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}`, [c.longitude - dLon, c.latitude - dLat, c.longitude + dLon, c.latitude + dLat], 14);
  };

  const remove = (row: PackRow) =>
    Alert.alert('Удалить офлайн-карту?', row.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          OfflineManager.removeListener(row.pack.id);
          await OfflineManager.deletePack(row.pack.id).catch(() => {});
          reload();
        },
      },
    ]);

  const used = (packs ?? []).reduce((sum, r) => sum + (r.status?.completedResourceSize ?? 0), 0);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section
        title={packs?.length ? `Скачано · ${formatBytes(used)}` : 'Скачано'}
        footer="Скачанные районы показываются без интернета. Поиск и построение новых маршрутов без сети не работают, а уже начатое ведение — работает."
      >
        {packs === null ? (
          <View style={st.loading}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : packs.length === 0 ? (
          <Text style={st.empty}>Пока ничего не скачано.</Text>
        ) : (
          packs.map((row, i) => {
            const pct = row.status?.percentage ?? 0;
            const done = row.status?.state === 'complete';
            return (
              <Row
                key={row.pack.id}
                first={i === 0}
                icon={done ? 'checkmark.circle.fill' : 'arrow.down.circle'}
                iconColor={done ? '#2F9E6B' : colors.accent}
                title={row.name}
                subtitle={
                  done
                    ? formatBytes(row.status?.completedResourceSize ?? 0)
                    : row.status
                      ? `Загрузка ${Math.round(pct)}% · ${formatBytes(row.status.completedResourceSize)}`
                      : 'Подготовка…'
                }
                right={<Text onPress={() => remove(row)} style={st.remove}>Удалить</Text>}
              />
            );
          })
        )}
      </Section>

      {error ? <Text style={st.error}>{error}</Text> : null}

      <Section title="Скачать">
        <Row first icon="location.circle.fill" iconColor={colors.accent} title="Вокруг меня" subtitle="Радиус ~12 км, все улицы" onPress={downloadAroundMe} />
        {PRESETS.map((p) => (
          <Row key={p.id} icon="map.fill" iconColor="#2F9E6B" title={p.name} subtitle={p.description} onPress={() => download(p.name, p.bounds, p.maxZoom)} />
        ))}
      </Section>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  loading: { padding: 20 },
  empty: { color: colors.textSecondary, padding: 16, fontSize: 15 },
  remove: { color: colors.red, fontSize: 14, paddingLeft: 8 },
  error: { color: colors.orange, fontSize: 14, marginBottom: 16, marginHorizontal: 16 },
});
