import { View } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import type { Lane, Maneuver } from '../lib/instructions';
import { isRoundabout, modifierAngle, roundaboutGlyph, turnGlyph, type GlyphShape } from '../lib/maneuverGlyph';
import { Icon } from './Icon';

function Shapes({ shapes, color, ghost }: { shapes: GlyphShape[]; color: string; ghost: string }) {
  return (
    <>
      {shapes.map((s, i) =>
        s.kind === 'stroke' ? (
          <Path key={i} d={s.d} stroke={s.role === 'main' ? color : ghost} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : (
          <Polygon key={i} points={s.points} fill={s.role === 'main' ? color : ghost} stroke={s.role === 'main' ? color : ghost} strokeWidth={3} strokeLinejoin="round" />
        ),
      )}
    </>
  );
}

export function ManeuverArrow({ maneuver, size, color = '#FFFFFF' }: { maneuver: Maneuver; size: number; color?: string }) {
  if (maneuver.type === 'arrive') return <Icon name="flag.checkered" size={size * 0.72} color={color} />;
  if (maneuver.type === 'waypoint') return <Icon name="mappin.and.ellipse" size={size * 0.72} color={color} />;
  const shapes = isRoundabout(maneuver.type) ? roundaboutGlyph(modifierAngle(maneuver.modifier)) : turnGlyph(modifierAngle(maneuver.modifier));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Shapes shapes={shapes} color={color} ghost="rgba(255,255,255,0.22)" />
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
              <Shapes shapes={turnGlyph(modifierAngle(ind))} color={color} ghost="transparent" />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}
