import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** SF Symbol icon (native iOS glyphs). */
export function Icon({
  name,
  size = 20,
  color = '#FFFFFF',
  weight = 'semibold',
  style,
}: {
  name: SFSymbol;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

export type { SFSymbol };
