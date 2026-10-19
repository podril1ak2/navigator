import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, ScrollView } from 'react-native';
import { Row, Section, SegmentedRow, ToggleRow } from '../components/List';
import type { TravelMode } from '../lib/api';
import { usePalette } from '../lib/theme';
import { useTrip } from '../positioning/TripProvider';
import { useAppState, type MapTheme } from '../state/AppState';

const THEMES: { value: MapTheme; title: string }[] = [
  { value: 'auto', title: 'Авто' },
  { value: 'day', title: 'День' },
  { value: 'night', title: 'Ночь' },
];
const MODES: { value: TravelMode; title: string }[] = [
  { value: 'car', title: 'Авто' },
  { value: 'bike', title: 'Вело' },
  { value: 'foot', title: 'Пешком' },
];
const TOLERANCE: { value: number | null; title: string }[] = [
  { value: null, title: 'Выкл' },
  { value: 0, title: '+0' },
  { value: 10, title: '+10' },
  { value: 20, title: '+20' },
];

export default function SettingsScreen() {
  const colors = usePalette();
  const { settings, updateSettings, clearRecents, recents } = useAppState();
  const { permission, online } = useTrip();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section>
        <Row first icon="arrow.down.circle.fill" iconColor="#2F9E6B" title="Офлайн-карты" subtitle="Скачайте районы на случай отключения интернета" chevron onPress={() => router.push('/offline')} />
        <Row icon="clock.arrow.circlepath" iconColor="#4B6BFF" title="Поездки и парковка" chevron onPress={() => router.push('/history')} />
        <Row icon="star.fill" iconColor="#D9A21B" title="Избранное" chevron onPress={() => router.push('/favorites')} />
      </Section>

      <Section title="Навигация">
        <ToggleRow first icon="speaker.wave.2.fill" iconColor="#E5532D" title="Голосовые подсказки" value={settings.voice} onChange={(voice) => updateSettings({ voice })} />
        <Row icon="waveform" iconColor="#6C63FF" title="Голос" value={settings.voiceId ? 'Выбран' : 'Авто'} chevron onPress={() => router.push('/voices')} />
        <ToggleRow icon="camera.fill" iconColor="#D9534F" title="Предупреждать о камерах" value={settings.cameraAlerts} onChange={(cameraAlerts) => updateSettings({ cameraAlerts })} />
        <ToggleRow icon="gauge.with.needle.fill" iconColor="#6C63FF" title="Показывать скорость" value={settings.showSpeed} onChange={(showSpeed) => updateSettings({ showSpeed })} />
        <SegmentedRow
          title="Предупреждать о превышении"
          options={TOLERANCE}
          value={settings.overSpeedTolerance}
          onChange={(overSpeedTolerance) => updateSettings({ overSpeedTolerance })}
        />
        <ToggleRow icon="sun.max.fill" iconColor="#C47A2C" title="Не гасить экран" value={settings.keepAwake} onChange={(keepAwake) => updateSettings({ keepAwake })} />
        <ToggleRow icon="parkingsign" iconColor="#4B6BFF" title="Запоминать парковку" subtitle="После поездки на машине" value={settings.autoParking} onChange={(autoParking) => updateSettings({ autoParking })} />
      </Section>

      <Section title="Карта">
        <SegmentedRow first title="Тема" options={THEMES} value={settings.mapTheme} onChange={(mapTheme) => updateSettings({ mapTheme })} />
        <ToggleRow icon="building.2.fill" iconColor="#636B78" title="3D-здания" value={settings.buildings3d} onChange={(buildings3d) => updateSettings({ buildings3d })} />
        <SegmentedRow title="Способ передвижения по умолчанию" options={MODES} value={settings.defaultMode} onChange={(defaultMode) => updateSettings({ defaultMode })} />
      </Section>

      <Section
        title="Защита от глушилок"
        footer="Навигатор отбрасывает точки с нереальной скоростью, «телепортацию» в аэропорты и неверное время со спутников. Когда GPS пропадает, позиция продолжает двигаться по маршруту: на машине — по последней скорости, пешком — по шагомеру. Уже построенный маршрут работает без интернета."
      >
        <Row first icon="location.fill" iconColor={permission === 'granted' ? '#2F9E6B' : colors.red} title="Геолокация" value={permission === 'granted' ? 'Разрешена' : 'Нет доступа'} />
        <Row icon="wifi" iconColor={online ? '#2F9E6B' : '#636B78'} title="Интернет" value={online ? 'Есть' : 'Нет'} />
      </Section>

      <Section title="Данные">
        <Row
          first
          icon="trash.fill"
          iconColor={colors.red}
          title={`Очистить историю поиска (${recents.length})`}
          destructive
          onPress={
            recents.length
              ? () =>
                  Alert.alert('Очистить историю поиска?', undefined, [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Очистить', style: 'destructive', onPress: clearRecents },
                  ])
              : undefined
          }
        />
      </Section>

      <Section footer="Карты © OpenFreeMap, данные © участники OpenStreetMap. Поиск: Photon, Nominatim. Маршруты: OSRM. Экспериментальное приложение — следите за дорогой и знаками.">
        <Row first title="Версия" value={`${Constants.expoConfig?.version ?? '1.0.0'}`} />
      </Section>
    </ScrollView>
  );
}
