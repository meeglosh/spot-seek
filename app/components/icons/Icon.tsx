import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors, iconStroke } from '../../lib/theme';
import { ICON_PATHS, type IconName, type IconSegment } from './paths';

export type IconProps = {
  name: IconName;
  /** Rendered size in points (the glyph is drawn on a 24-unit grid). Default 24. */
  size?: number;
  /** Stroke (and fill, where the glyph has one) colour. Default: primary text. */
  color?: string;
  /** Stroke ends and corners. Default comes from `iconStroke` in the theme (round, soft). */
  caps?: 'round' | 'square';
};

// The one icon API for the app. Stroke is 2 grid units (2pt at size 24) with
// round caps and joins (theme `iconStroke`); the same paths render square and
// mitered with caps="square". `color` is the only other styling knob so icons
// can never drift from the set's grammar. Decorative by default (hidden from
// screen readers); the tappable parent carries the accessibilityLabel.
export function Icon({ name, size = 24, color = colors.textPrimary, caps }: IconProps) {
  const square = (caps ?? iconStroke.cap) === 'square';
  const segments: readonly IconSegment[] = ICON_PATHS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {segments.map((seg, i) => (
        <Path
          key={i}
          d={seg.d}
          stroke={color}
          strokeWidth={iconStroke.width}
          strokeLinecap={square ? 'square' : 'round'}
          strokeLinejoin={square ? 'miter' : 'round'}
          strokeMiterlimit={10}
          fill={seg.fill ? color : 'none'}
        />
      ))}
    </Svg>
  );
}
