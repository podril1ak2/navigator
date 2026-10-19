import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { usePalette } from '../lib/theme';

/** SF Symbol icon (native iOS glyphs). Defaults to the theme's text color. */
export function Icon({
  name,
  size = 20,
  color,
  weight = 'semibold',
  style,
}: {
  name: SFSymbol;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color ?? palette.text}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

export type { SFSymbol };
