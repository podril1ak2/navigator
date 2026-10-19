import { View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { Lane, Maneuver } from '../lib/instructions';
import { Icon } from './Icon';

const ANGLE: Record<string, number> = {
  straight: 0,
  'slight right': 40,
  right: 90,
  'sharp right': 135,
  'slight left': -40,
  left: -90,
  'sharp left': -135,
  uturn: 180,
};

export function modifierAngle(modifier?: string): number {
  return ANGLE[modifier ?? 'straight'] ?? 0;
}

type V = { x: number; y: number };
const add = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dir = (deg: number): V => ({ x: Math.sin((deg * Math.PI) / 180), y: -Math.cos((deg * Math.PI) / 180) });
const pts = (...v: V[]) => v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Arrowhead polygon at `tip` pointing along unit vector `d`. */
function head(tip: V, d: V, size: number) {
  const n = { x: -d.y, y: d.x };
  const base = add(tip, d, -size);
  return pts(tip, add(base, n, size * 0.85), add(base, n, -size * 0.85));
}

/** Turn arrow in a 100×100 box: stem from the bottom, bending by `angle`. */
function TurnArrow({ angle, color, ghost }: { angle: number; color: string; ghost: string }) {
  if (Math.abs(angle) >= 180) {
    // U-turn: up, around, and back down on the left.
    return (
      <>
        <Path d="M64 92 L64 44 A15 15 0 0 0 34 44 L34 58" stroke={color} strokeWidth={12} strokeLinecap="round" fill="none" />
        <Polygon points={head({ x: 34, y: 76 }, { x: 0, y: 1 }, 17)} fill={color} />
      </>
    );
  }
  const junction = { x: 50, y: 60 };
  const d = dir(angle);
  const ctrl = { x: 50, y: 46 };
  const end = add(junction, d, 26);
  const len = Math.hypot(end.x - ctrl.x, end.y - ctrl.y) || 1;
  const tangent = angle === 0 ? { x: 0, y: -1 } : { x: (end.x - ctrl.x) / len, y: (end.y - ctrl.y) / len };
  const tip = add(end, tangent, 15);
  return (
    <>
      {angle !== 0 ? <Path d="M50 60 L50 10" stroke={ghost} strokeWidth={10} strokeLinecap="round" /> : null}
      <Path
        d={angle === 0 ? 'M50 92 L50 28' : `M50 92 L50 60 Q${ctrl.x} ${ctrl.y} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`}
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Polygon points={head(angle === 0 ? { x: 50, y: 12 } : tip, tangent, 17)} fill={color} />
    </>
  );
}

function RoundaboutArrow({ exitAngle, color, ghost }: { exitAngle: number; color: string; ghost: string }) {
  const c = { x: 50, y: 44 };
  const r = 17;
  const d = dir(exitAngle);
  const from = add(c, d, r);
  const tip = add(c, d, r + 28);
  return (
    <>
      <Circle cx={c.x} cy={c.y} r={r} stroke={ghost} strokeWidth={9} fill="none" />
      <Path d={`M50 92 L50 ${c.y + r}`} stroke={color} strokeWidth={12} strokeLinecap="round" />
      <Path
        // Right-hand traffic: counterclockwise from the bottom entry to the exit.
        // Sweep flag 0 = counterclockwise on screen; large arc when sweeping past 180°.
        d={`M50 ${c.y + r} A${r} ${r} 0 ${exitAngle < 0 ? 1 : 0} 0 ${from.x.toFixed(1)} ${from.y.toFixed(1)}`}
        stroke={color}
        strokeWidth={9}
        fill="none"
      />
      <Path d={`M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${add(tip, d, -12).x.toFixed(1)} ${add(tip, d, -12).y.toFixed(1)}`} stroke={color} strokeWidth={12} strokeLinecap="round" />
      <Polygon points={head(tip, d, 16)} fill={color} />
    </>
  );
}

export function ManeuverArrow({ maneuver, size, color = '#FFFFFF' }: { maneuver: Maneuver; size: number; color?: string }) {
  const ghost = 'rgba(255,255,255,0.28)';
  if (maneuver.type === 'arrive') return <Icon name="flag.checkered" size={size * 0.72} color={color} />;
  if (maneuver.type === 'waypoint') return <Icon name="mappin.and.ellipse" size={size * 0.72} color={color} />;
  const isRoundabout = ['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary'].includes(maneuver.type);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {isRoundabout ? (
          <RoundaboutArrow exitAngle={modifierAngle(maneuver.modifier) || 1} color={color} ghost={ghost} />
        ) : (
          <TurnArrow angle={modifierAngle(maneuver.modifier)} color={color} ghost={ghost} />
        )}
      </Svg>
    </View>
  );
}

/** Lane guidance row: one small arrow per lane, highlighted where the route goes. */
export function LaneGuide({ lanes, color = '#FFFFFF' }: { lanes: Lane[]; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, justifyContent: 'center' }}>
      {lanes.map((lane, i) => {
        const ind = lane.indications.find((x) => x !== 'none') ?? 'straight';
        return (
          <View
            key={i}
            style={{
              width: 34,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: 'rgba(255,255,255,0.18)',
              opacity: lane.valid ? 1 : 0.32,
            }}
          >
            <Svg width={26} height={26} viewBox="0 0 100 100">
              <TurnArrow angle={modifierAngle(ind)} color={color} ghost="transparent" />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}
