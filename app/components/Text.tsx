import React from 'react';
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { fonts, maxFontScale } from '../lib/theme';

// Drop-in replacement for react-native's Text that keeps Dynamic Type ON
// (allowFontScaling defaults to true) but caps the growth so fixed chrome
// does not break: display / label / data faces (Anton, Space Grotesk) scale
// to 1.3x, reading text (Archivo Narrow) to 1.6x. An explicit
// `maxFontSizeMultiplier` prop always wins.
const CHROME_FAMILIES: ReadonlySet<string> = new Set([
  fonts.display, fonts.label, fonts.labelBold,
]);

export function Text({ style, maxFontSizeMultiplier, ...rest }: TextProps) {
  let cap = maxFontSizeMultiplier;
  if (cap === undefined) {
    const family = StyleSheet.flatten(style)?.fontFamily;
    cap = family && CHROME_FAMILIES.has(family) ? maxFontScale.display : maxFontScale.body;
  }
  return <RNText {...rest} style={style} maxFontSizeMultiplier={cap} />;
}
