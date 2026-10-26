import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { isSplitLayout } from '../lib/splitLayout';
import {
  READABLE_MAX_WIDTH, insetsWithinColumn, isFoldedSplit, readableWidth,
} from '../lib/readableWidth';

/**
 * Caps its children to a centred column of READABLE_MAX_WIDTH on wide windows
 * (iPad, iPhone Duo inner display). On narrower ones the same two wrapper
 * views are layout-neutral (flex: 1, no width), so normal iPhones are
 * identical. The tree shape never changes with width: rotating or folding
 * must not remount the screen and lose its state.
 *
 * Descendants that read useSafeAreaInsets() see the side insets reduced by the
 * margin, so the Duo status-strip padding is not applied twice once the column
 * clears the strip.
 */
export function Readable({
  children, disabled = false, unlessSplit = false, unlessFolded = false, max = READABLE_MAX_WIDTH,
}: {
  children: React.ReactNode; disabled?: boolean; unlessSplit?: boolean; unlessFolded?: boolean;
  max?: number;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const uncapped =
    disabled
    || (unlessSplit && isSplitLayout(width, height))
    || (unlessFolded && isFoldedSplit(width, height))
    || width <= max;
  const inner = uncapped ? insets : { ...insets, ...insetsWithinColumn(insets, width, max) };
  return (
    <View style={s.outer}>
      <View style={[s.column, !uncapped && { width: readableWidth(width, max) }]}>
        <SafeAreaInsetsContext.Provider value={inner}>
          {children}
        </SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

/** Wrap a screen component so it renders inside <Readable>. */
export function withReadable<P extends object>(
  Screen: React.ComponentType<P>,
  opts: { unlessSplit?: boolean; unlessFolded?: boolean } = {},
) {
  function ReadableScreen(props: P) {
    return (
      <Readable unlessSplit={opts.unlessSplit} unlessFolded={opts.unlessFolded}><Screen {...props} />
      </Readable>
    );
  }
  ReadableScreen.displayName = `Readable(${Screen.displayName || Screen.name || 'Screen'})`;
  return ReadableScreen;
}

const s = StyleSheet.create({
  outer: { flex: 1, alignItems: 'stretch', backgroundColor: colors.canvas },
  column: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: '100%' },
});
