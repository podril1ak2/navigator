import { router } from 'expo-router';
import { Alert, ScrollView, Text } from 'react-native';
import { Row, Section } from '../components/List';
import type { TravelMode } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import { usePalette } from '../lib/theme';
import { useAppState } from '../state/AppState';

const MODE_ICON = { car: 'car.fill', bike: 'bicycle', foot: 'figure.walk' } as const satisfies Record<TravelMode, string>;

function formatDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === today.toDateString()) return `Сегодня, ${time}`;
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}, ${time}`;
}

export default function HistoryScreen() {
  const colors = usePalette();
  const { trips, clearTrips, parking, setParking, openOnMap } = useAppState();
  const total = trips.reduce((sum, t) => sum + t.distance, 0);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section title="Парковка" footer="Место сохраняется автоматически, когда вы завершаете поездку на машине.">
        {parking ? (
          <>
            <Row
              first
              icon="parkingsign"
              iconColor="#4B6BFF"
              title="Моя машина"
              subtitle={`Оставлена ${formatDate(parking.savedAt).toLowerCase()}`}
              chevron
              onPress={() => {
                openOnMap({ id: 'parking', name: 'Моя машина', address: 'Место парковки', coordinate: parking.coordinate });
                router.dismissAll();
              }}
            />
            <Row title="Забыть место парковки" destructive onPress={() => setParking(null)} />
          </>
        ) : (
          <Row first icon="parkingsign" iconColor="#636B78" title="Пока не сохранено" />
        )}
      </Section>

      <Section title={trips.length ? `Поездки · ${formatDistance(total)} всего` : 'Поездки'}>
        {trips.length === 0 ? (
          <Text style={{ color: colors.textSecondary, padding: 16, fontSize: 15 }}>Здесь появятся ваши поездки.</Text>
        ) : (
          trips.map((t, i) => (
            <Row
              key={t.id}
              first={i === 0}
              icon={MODE_ICON[t.mode]}
              iconColor={t.arrived ? '#2F9E6B' : '#636B78'}
              title={t.to.name}
              subtitle={`${formatDate(t.startedAt)} · ${formatDistance(t.distance)} · ${formatDuration((t.endedAt - t.startedAt) / 1000)}${t.arrived ? '' : ' · не завершена'}`}
              chevron
              onPress={() => {
                openOnMap(t.to);
                router.dismissAll();
              }}
            />
          ))
        )}
      </Section>

      {trips.length ? (
        <Section>
          <Row
            first
            title="Очистить историю поездок"
            destructive
            onPress={() =>
              Alert.alert('Очистить историю поездок?', undefined, [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Очистить', style: 'destructive', onPress: clearTrips },
              ])
            }
          />
        </Section>
      ) : null}
    </ScrollView>
  );
}
