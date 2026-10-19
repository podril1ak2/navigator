/**
 * Geometry of maneuver arrows in a 100×100 box, as plain shapes. Rendered by
 * react-native-svg in the app and by resvg in design checks, so both match.
 */

export type GlyphShape =
  | { kind: 'stroke'; d: string; width: number; role: 'main' | 'ghost' }
  | { kind: 'fill'; points: string; role: 'main' | 'ghost' };

const ANGLE: Record<string, number> = {
  straight: 0,
  'slight right': 42,
  right: 90,
  'sharp right': 140,
  'slight left': -42,
  left: -90,
  'sharp left': -140,
  uturn: 180,
};

export function modifierAngle(modifier?: string): number {
  return ANGLE[modifier ?? 'straight'] ?? 0;
}

type V = { x: number; y: number };
const f = (n: number) => n.toFixed(1);
const dir = (deg: number): V => ({ x: Math.sin((deg * Math.PI) / 180), y: -Math.cos((deg * Math.PI) / 180) });

/** Arrowhead triangle whose tip is at `tip`, pointing along unit vector `d`. */
function head(tip: V, d: V, len: number, halfWidth: number): string {
  const n = { x: -d.y, y: d.x };
  const bx = tip.x - d.x * len;
  const by = tip.y - d.y * len;
  return [
    `${f(tip.x)},${f(tip.y)}`,
    `${f(bx + n.x * halfWidth)},${f(by + n.y * halfWidth)}`,
    `${f(bx - n.x * halfWidth)},${f(by - n.y * halfWidth)}`,
  ].join(' ');
}

const STROKE = 14;
const HEAD_LEN = 24;
const HEAD_W = 19;

/** Turn arrow: a straight stem from the bottom that bends smoothly into the new direction. */
export function turnGlyph(angle: number, opts: { ghost?: boolean } = {}): GlyphShape[] {
  if (Math.abs(angle) >= 180) {
    // U-turn (to the left, right-hand traffic): up, over the top, back down.
    return [
      { kind: 'stroke', d: 'M66 94 L66 42 A17 17 0 0 0 32 42 L32 58', width: STROKE, role: 'main' },
      { kind: 'fill', points: head({ x: 32, y: 84 }, { x: 0, y: 1 }, HEAD_LEN, HEAD_W), role: 'main' },
    ];
  }
  if (angle === 0) {
    return [
      { kind: 'stroke', d: 'M50 94 L50 34', width: STROKE, role: 'main' },
      { kind: 'fill', points: head({ x: 50, y: 8 }, { x: 0, y: -1 }, HEAD_LEN + 4, HEAD_W), role: 'main' },
    ];
  }
  if (Math.abs(angle) > 100) return sharpGlyph(angle);
  // Stem goes up to the junction, then a quadratic curve turns into `angle`.
  const sharp = false;
  // Sharp turns: stem shifted away and the bend goes over the top, so the head
  // (pointing back down) never overlaps the stem.
  const junction: V = sharp ? { x: 50 - Math.sign(angle) * 17, y: 46 } : { x: 50 - Math.sign(angle) * 10, y: 58 };
  const d = dir(angle);
  const ctrl: V = { x: junction.x, y: junction.y - (sharp ? 18 : 16) };
  const reach = sharp ? 27 : Math.abs(angle) < 60 ? 26 : 24;
  const end: V = { x: ctrl.x + d.x * reach, y: ctrl.y + d.y * reach };
  const tip: V = { x: end.x + d.x * (HEAD_LEN - 4), y: end.y + d.y * (HEAD_LEN - 4) };
  const shapes: GlyphShape[] = [];
  if (opts.ghost) shapes.push({ kind: 'stroke', d: `M${f(junction.x)} ${junction.y} L${f(junction.x)} 10`, width: STROKE - 4, role: 'ghost' });
  shapes.push(
    { kind: 'stroke', d: `M${f(junction.x)} 94 L${f(junction.x)} ${junction.y} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(end.x)} ${f(end.y)}`, width: STROKE, role: 'main' },
    { kind: 'fill', points: head(tip, d, HEAD_LEN, HEAD_W), role: 'main' },
  );
  return shapes;
}

/** Sharp turn: stem on one side, bend over the top, then down-and-away with a smaller head. */
function sharpGlyph(angle: number): GlyphShape[] {
  const sign = Math.sign(angle);
  const x0 = 50 - sign * 25;
  const top: V = { x: x0 + sign * 19, y: 22 };
  const d = dir(angle);
  const end: V = { x: top.x + d.x * 16, y: top.y + d.y * 16 };
  const tip: V = { x: end.x + d.x * 22, y: end.y + d.y * 22 };
  return [
    { kind: 'stroke', d: `M${x0} 94 L${x0} 44 Q${x0} 20 ${f(top.x)} ${f(top.y)} L${f(end.x)} ${f(end.y)}`, width: STROKE, role: 'main' },
    { kind: 'fill', points: head(tip, d, 22, 17), role: 'main' },
  ];
}

/** Roundabout: ring, entry from the bottom, counterclockwise arc to the exit. */
export function roundaboutGlyph(exitAngle: number): GlyphShape[] {
  const c = { x: 50, y: 46 };
  const r = 18;
  const a = exitAngle === 0 ? 1 : exitAngle; // straight: just under 180° sweep
  const d = dir(a);
  const from = { x: c.x + d.x * r, y: c.y + d.y * r };
  const tip = { x: c.x + d.x * (r + 32), y: c.y + d.y * (r + 32) };
  const stemEnd = { x: tip.x - d.x * (HEAD_LEN - 4), y: tip.y - d.y * (HEAD_LEN - 4) };
  return [
    { kind: 'stroke', d: `M${c.x - r} ${c.y} A${r} ${r} 0 1 0 ${c.x + r} ${c.y} A${r} ${r} 0 1 0 ${c.x - r} ${c.y}`, width: 5, role: 'ghost' },
    { kind: 'stroke', d: `M50 96 L50 ${c.y + r} A${r} ${r} 0 ${a < 0 ? 1 : 0} 0 ${f(from.x)} ${f(from.y)} L${f(stemEnd.x)} ${f(stemEnd.y)}`, width: 13, role: 'main' },
    { kind: 'fill', points: head(tip, d, HEAD_LEN - 2, HEAD_W - 2), role: 'main' },
  ];
}

export function isRoundabout(type: string) {
  return ['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary'].includes(type);
}

/** SVG markup (for design renders / static images). */
export function glyphSvg(shapes: GlyphShape[], color: string, ghost: string, size: number, bg?: string): string {
  const body = shapes
    .map((s) =>
      s.kind === 'stroke'
        ? `<path d="${s.d}" stroke="${s.role === 'main' ? color : ghost}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
        : `<polygon points="${s.points}" fill="${s.role === 'main' ? color : ghost}" stroke="${s.role === 'main' ? color : ghost}" stroke-width="3" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}${body}</svg>`;
}
