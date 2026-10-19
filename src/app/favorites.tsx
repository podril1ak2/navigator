import { router } from 'expo-router';
import { Alert, ScrollView, Text } from 'react-native';
import { Row, Section } from '../components/List';
import { colors } from '../lib/theme';
import { useAppState, type SavedPlace } from '../state/AppState';

export default function FavoritesScreen() {
  const { favorites, removeFavorite, openOnMap } = useAppState();
  const home = favorites.find((f) => f.label === 'home');
  const work = favorites.find((f) => f.label === 'work');
  const others = favorites.filter((f) => !f.label);

  const open = (p: SavedPlace) => {
    openOnMap(p);
    router.back();
  };

  const confirmRemove = (p: SavedPlace) =>
    Alert.alert('Удалить из избранного?', p.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFavorite(p.id) },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section footer={!home || !work ? 'Найдите место и нажмите «Сделать домом» или «Сделать работой» в его карточке.' : undefined}>
        <Row
          first
          icon="house.fill"
          iconColor="#2F9E6B"
          title="Дом"
          subtitle={home ? [home.name, home.address].filter(Boolean).join(', ') : 'Не задан'}
          chevron={!!home}
          onPress={home ? () => open(home) : undefined}
        />
        <Row
          icon="briefcase.fill"
          iconColor="#8C6CFF"
          title="Работа"
          subtitle={work ? [work.name, work.address].filter(Boolean).join(', ') : 'Не задана'}
          chevron={!!work}
          onPress={work ? () => open(work) : undefined}
        />
      </Section>

      <Section title="Сохранённые места" footer={others.length ? 'Нажмите на место, чтобы открыть его на карте.' : undefined}>
        {others.length === 0 ? (
          <Text style={{ color: colors.textSecondary, padding: 16, fontSize: 15 }}>Нажмите на звёздочку в карточке места, чтобы сохранить его здесь.</Text>
        ) : (
          others.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              icon="star.fill"
              iconColor="#D9A21B"
              title={p.name}
              subtitle={p.address || undefined}
              onPress={() => open(p)}
              right={<Text onPress={() => confirmRemove(p)} style={{ color: colors.red, fontSize: 14, paddingLeft: 8 }}>Удалить</Text>}
            />
          ))
        )}
      </Section>
    </ScrollView>
  );
}
