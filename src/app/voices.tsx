import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Row, Section, SegmentedRow } from '../components/List';
import { usePalette } from '../lib/theme';
import { bestRussianVoice, speak } from '../positioning/TripProvider';
import { useAppState } from '../state/AppState';

const SAMPLE = 'Через триста метров поверните направо. Затем держитесь левее';

const RATES: { value: number; title: string }[] = [
  { value: 0.9, title: 'Медленнее' },
  { value: 1, title: 'Обычно' },
  { value: 1.08, title: 'Быстрее' },
];

export default function VoicesScreen() {
  const colors = usePalette();
  const { settings, updateSettings } = useAppState();
  const [voices, setVoices] = useState<Speech.Voice[] | null>(null);
  const [auto, setAuto] = useState<string | undefined>();

  const load = useCallback(() => {
    Speech.getAvailableVoicesAsync()
      .then((all) => {
        const ru = all.filter((v) => v.language.toLowerCase().startsWith('ru'));
        // Better quality first, then by name.
        ru.sort((a, b) => (a.quality === b.quality ? a.name.localeCompare(b.name) : a.quality === Speech.VoiceQuality.Enhanced ? -1 : 1));
        setVoices(ru);
      })
      .catch(() => setVoices([]));
    bestRussianVoice().then(setAuto);
  }, []);

  useEffect(() => {
    // Voices downloaded in iOS Settings show up when the user comes back.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    load();
    return () => sub.remove();
  }, [load]);

  const select = (id: string | null) => {
    updateSettings({ voiceId: id });
    speak(SAMPLE, { voice: id ?? auto, rate: settings.voiceRate });
  };

  const autoName = voices?.find((v) => v.identifier === auto)?.name;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section footer="Нажмите на голос, чтобы послушать и выбрать его.">
        <Row
          first
          icon="sparkles"
          iconColor="#6C63FF"
          title="Автоматически"
          subtitle={autoName ? `Лучший установленный: ${autoName}` : 'Лучший установленный голос'}
          right={settings.voiceId === null ? <Icon name="checkmark" size={15} color={colors.accent} weight="bold" /> : undefined}
          onPress={() => select(null)}
        />
        {voices === null ? (
          <View style={{ padding: 16 }}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : (
          voices.map((v) => (
            <Row
              key={v.identifier}
              icon={v.quality === Speech.VoiceQuality.Enhanced ? 'waveform' : 'speaker.wave.1.fill'}
              iconColor={v.quality === Speech.VoiceQuality.Enhanced ? '#2F9E6B' : '#8E8E93'}
              title={v.name}
              subtitle={v.quality === Speech.VoiceQuality.Enhanced ? 'Улучшенное качество' : 'Стандартное качество'}
              right={settings.voiceId === v.identifier ? <Icon name="checkmark" size={15} color={colors.accent} weight="bold" /> : undefined}
              onPress={() => select(v.identifier)}
            />
          ))
        )}
      </Section>

      <Section>
        <SegmentedRow
          first
          title="Скорость речи"
          options={RATES}
          value={settings.voiceRate}
          onChange={(voiceRate) => {
            updateSettings({ voiceRate });
            speak(SAMPLE, { voice: settings.voiceId ?? auto, rate: voiceRate });
          }}
        />
      </Section>

      <Section
        title="Как получить голос лучше"
        footer="Улучшенные голоса Милена и Юрий звучат намного естественнее стандартных и работают без интернета. После загрузки вернитесь сюда — голос появится в списке."
      >
        <Row
          first
          icon="arrow.down.circle.fill"
          iconColor="#2F9E6B"
          title="Скачать голос в настройках iPhone"
          subtitle="Универсальный доступ → Устн. контент → Голоса → Русский → Милена или Юрий (улучшенный)"
          chevron
          onPress={() => Linking.openSettings()}
        />
      </Section>

      <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 17, marginHorizontal: 16 }}>
        Голос Алисы принадлежит Яндексу и доступен только в их приложениях, поэтому его здесь нет.
      </Text>
    </ScrollView>
  );
}
