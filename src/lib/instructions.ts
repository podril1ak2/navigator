import type { TravelMode } from './api';

export type Maneuver = {
  type: string;
  modifier?: string;
  exit?: number;
};

/** One lane at an intersection; `valid` lanes lead along the route. */
export type Lane = { valid: boolean; indications: string[] };

const TURN: Record<string, string> = {
  uturn: 'Развернитесь',
  'sharp right': 'Резко поверните направо',
  right: 'Поверните направо',
  'slight right': 'Держитесь правее',
  straight: 'Двигайтесь прямо',
  'slight left': 'Держитесь левее',
  left: 'Поверните налево',
  'sharp left': 'Резко поверните налево',
};

const SIDE: Record<string, string> = {
  'sharp right': 'правее',
  right: 'правее',
  'slight right': 'правее',
  'sharp left': 'левее',
  left: 'левее',
  'slight left': 'левее',
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Case = 'acc' | 'dat';

// Street type words: [accusative ("на ..."), dative ("по ...")], with grammatical gender.
const STREET_NOUNS: Record<string, { acc: string; dat: string; gender: 'f' | 'm' | 'n' }> = {
  улица: { acc: 'улицу', dat: 'улице', gender: 'f' },
  набережная: { acc: 'набережную', dat: 'набережной', gender: 'f' },
  площадь: { acc: 'площадь', dat: 'площади', gender: 'f' },
  аллея: { acc: 'аллею', dat: 'аллее', gender: 'f' },
  линия: { acc: 'линию', dat: 'линии', gender: 'f' },
  дорога: { acc: 'дорогу', dat: 'дороге', gender: 'f' },
  эстакада: { acc: 'эстакаду', dat: 'эстакаде', gender: 'f' },
  проезд: { acc: 'проезд', dat: 'проезду', gender: 'm' },
  проспект: { acc: 'проспект', dat: 'проспекту', gender: 'm' },
  переулок: { acc: 'переулок', dat: 'переулку', gender: 'm' },
  бульвар: { acc: 'бульвар', dat: 'бульвару', gender: 'm' },
  тупик: { acc: 'тупик', dat: 'тупику', gender: 'm' },
  мост: { acc: 'мост', dat: 'мосту', gender: 'm' },
  тоннель: { acc: 'тоннель', dat: 'тоннелю', gender: 'm' },
  тракт: { acc: 'тракт', dat: 'тракту', gender: 'm' },
  шоссе: { acc: 'шоссе', dat: 'шоссе', gender: 'n' },
  кольцо: { acc: 'кольцо', dat: 'кольцу', gender: 'n' },
};

/** Declines an adjective in front of a street noun ("Кремлёвская" → "Кремлёвскую"). */
function declineAdjective(word: string, c: Case, gender: 'f' | 'm' | 'n'): string {
  const lowerWord = word.toLowerCase();
  const swap = (cut: number, end: string) => word.slice(0, word.length - cut) + end;
  if (gender === 'f') {
    if (lowerWord.endsWith('ая')) return swap(2, c === 'acc' ? 'ую' : 'ой');
    if (lowerWord.endsWith('яя')) return swap(2, c === 'acc' ? 'юю' : 'ей');
    return word;
  }
  if (c === 'acc') return word; // Inanimate masculine/neuter: accusative = nominative.
  if (/(ый|ой|ое)$/.test(lowerWord)) return swap(2, 'ому');
  if (/[кгхжшчщ]ий$/.test(lowerWord)) return swap(2, 'ому');
  if (/(ий|ее)$/.test(lowerWord)) return swap(2, 'ему');
  return word;
}

/**
 * Puts a Russian street name into the case needed after "на" (accusative) or "по" (dative).
 * "улица Охотный Ряд" → "улицу Охотный Ряд"; "Кремлёвская набережная" → "Кремлёвской набережной".
 * Names without a recognized street word are left as is.
 */
export function declineStreet(name: string, c: Case): string {
  const words = name.split(' ');
  const first = STREET_NOUNS[words[0]?.toLowerCase()];
  if (first) return [first[c], ...words.slice(1)].join(' ');
  const lastIndex = words.length - 1;
  const last = STREET_NOUNS[words[lastIndex]?.toLowerCase()];
  if (!last) return name;
  return words
    .map((w, i) => (i === lastIndex ? last[c] : /^[А-ЯЁа-яё-]+$/.test(w) ? declineAdjective(w, c, last.gender) : w))
    .join(' ');
}

/** Russian instruction text for an OSRM maneuver. */
export function instructionText(m: Maneuver, street: string, mode: TravelMode): string {
  const onto = street ? ` на ${declineStreet(street, 'acc')}` : '';
  const along = street ? ` по ${declineStreet(street, 'dat')}` : '';
  const turn = TURN[m.modifier ?? 'straight'] ?? 'Двигайтесь прямо';
  const side = SIDE[m.modifier ?? ''];

  switch (m.type) {
    case 'depart':
      return mode === 'foot' ? `Идите${along || ' по маршруту'}` : `Начните движение${along}`;
    case 'waypoint':
      return 'Промежуточная остановка';
    case 'arrive':
      if (m.modifier?.includes('right')) return 'Пункт назначения справа';
      if (m.modifier?.includes('left')) return 'Пункт назначения слева';
      return 'Вы прибыли';
    case 'turn':
      return `${turn}${onto}`;
    case 'end of road':
      return `В конце дороги ${lower(turn)}${onto}`;
    case 'fork':
      return `На развилке держитесь ${side ?? 'прямо'}${onto}`;
    case 'merge':
      return `Перестройтесь ${side ?? ''}${onto}`.replace('  ', ' ');
    case 'on ramp':
      return `Съезд${onto || ' на дорогу'}`;
    case 'off ramp':
      return `Съезжайте ${side ?? ''}${onto}`.replace('  ', ' ');
    case 'roundabout':
    case 'rotary':
      return m.exit
        ? `На круговом движении — ${m.exit}-й съезд${onto}`
        : `Въезжайте на круговое движение`;
    case 'roundabout turn':
      return `На круговом движении ${lower(turn)}${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Съезжайте с кругового движения${onto}`;
    case 'new name':
    case 'continue':
      if (m.modifier && m.modifier !== 'straight') return `${turn}${onto}`;
      return `Продолжайте движение${along}`;
    default:
      return m.modifier && m.modifier !== 'straight' ? `${turn}${onto}` : `Продолжайте движение${along}`;
  }
}

export { lower as lowerFirst };

