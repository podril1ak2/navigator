/**
 * Minimal OSM `opening_hours` parser for the common forms:
 *   "24/7", "Mo-Fr 09:00-21:00; Sa,Su 10:00-20:00", "Mo-Su 08:00-23:00",
 *   "Mo-Fr 09:00-13:00,14:00-18:00; Su off", "Fr,Sa 22:00-04:00".
 * Unsupported syntax (holidays, months, sunrise…) returns null and the raw text is shown.
 */

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const DAY_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_ACC_RU = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

/** Minutes from midnight; end may exceed 1440 for ranges past midnight. */
export type Interval = [number, number];
/** Index 0 = Monday. */
export type Week = Interval[][];

const DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-');
    const i = DAYS.indexOf(a as (typeof DAYS)[number]);
    if (i < 0) return null;
    if (b === undefined) {
      out.add(i);
      continue;
    }
    const j = DAYS.indexOf(b as (typeof DAYS)[number]);
    if (j < 0) return null;
    for (let k = i; ; k = (k + 1) % 7) {
      out.add(k);
      if (k === j) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Interval[] | null {
  const t = spec.trim();
  if (t === 'off' || t === 'closed') return [];
  if (t === '' || t === '24/7') return [[0, 1440]];
  const out: Interval[] = [];
  for (const part of t.split(',')) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const start = +m[1] * 60 + +m[2];
    let end = +m[3] * 60 + +m[4];
    if (end <= start) end += 1440;
    out.push([start, end]);
  }
  return out;
}

export function parseOpeningHours(value: string): Week | null {
  const v = value.trim();
  if (v === '24/7') return DAYS.map(() => [[0, 1440]]);
  const week: Week = DAYS.map(() => []);
  let any = false;
  for (const raw of v.split(';')) {
    const rule = raw.trim();
    if (!rule) continue;
    if (/^PH\b/.test(rule)) continue; // public holidays: ignored
    const m = new RegExp(`^(${DAY_RE}(?:-${DAY_RE})?(?:,${DAY_RE}(?:-${DAY_RE})?)*)?\\s*(.*)$`).exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const times = parseTimes(m[2]);
    if (!days || !times) return null;
    // Later rules override earlier ones for the days they name.
    for (const d of days) week[d] = times;
    any = true;
  }
  return any ? week : null;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export type HoursStatus = { open: boolean; label: string; soon?: boolean };

/** Open/closed status at `now`, e.g. "Открыто до 21:00" / "Закрыто · откроется завтра в 9:00". */
export function hoursStatus(week: Week, now: Date): HoursStatus {
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const min = now.getHours() * 60 + now.getMinutes();
  if (week.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { open: true, label: 'Круглосуточно' };

  const yesterday = week[(day + 6) % 7];
  const candidates: Interval[] = [...week[day], ...yesterday.filter(([, e]) => e > 1440).map(([s, e]) => [s - 1440, e - 1440] as Interval)];
  const current = candidates.find(([s, e]) => min >= s && min < e);
  if (current) {
    const left = current[1] - min;
    return { open: true, label: current[1] >= 1440 && current[0] <= 0 ? 'Открыто круглосуточно' : `Открыто до ${hhmm(current[1])}`, soon: left <= 60 };
  }
  for (let offset = 0; offset < 7; offset++) {
    const d = (day + offset) % 7;
    const next = week[d].map(([s]) => s).filter((s) => offset > 0 || s > min).sort((a, b) => a - b)[0];
    if (next !== undefined) {
      const when = offset === 0 ? '' : offset === 1 ? 'завтра ' : `${DAY_ACC_RU[d]} `;
      return { open: false, label: `Закрыто · откроется ${when}в ${hhmm(next)}`, soon: offset === 0 && next - min <= 60 };
    }
  }
  return { open: false, label: 'Закрыто' };
}

/** One display line per weekday: "9:00–21:00", "выходной". */
export function weekLines(week: Week): string[] {
  return week.map((intervals) =>
    intervals.length === 0
      ? 'выходной'
      : intervals.some(([s, e]) => s === 0 && e >= 1440)
        ? 'круглосуточно'
        : intervals.map(([s, e]) => `${hhmm(s)}–${hhmm(e)}`).join(', '),
  );
}
