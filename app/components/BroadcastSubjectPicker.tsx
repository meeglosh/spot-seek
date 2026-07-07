import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, FlatList,
  TextInput, useColorScheme, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPORTS } from '../lib/sports-data';
import { light, dark, fonts, spacing, radius } from '../lib/theme';

type Option = {
  key: string;        // unique key
  label: string;      // e.g. "Premier League"
  sport: string;      // e.g. "Soccer"
  sportEmoji: string;
};

// Flatten all leagues into a flat list of options.
const ALL_OPTIONS: Option[] = SPORTS.flatMap((sport) =>
  sport.leagues.map((league) => ({
    key: `${sport.id}:${league.id}`,
    label: league.name,
    sport: sport.name,
    sportEmoji: sport.emoji,
  })),
);

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BroadcastSubjectPicker({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_OPTIONS;
    const q = query.toLowerCase();
    return ALL_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sport.toLowerCase().includes(q),
    );
  }, [query]);

  // Group filtered options by sport for the list
  const grouped = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const o of filtered) {
      const bucket = map.get(o.sport) ?? [];
      bucket.push(o);
      map.set(o.sport, bucket);
    }
    // Flatten into section items for FlatList
    const rows: Array<{ type: 'header'; sport: string; emoji: string } | { type: 'option'; option: Option }> = [];
    for (const [sport, options] of map) {
      const emoji = options[0]?.sportEmoji ?? '';
      rows.push({ type: 'header', sport, emoji });
      for (const o of options) {
        rows.push({ type: 'option', option: o });
      }
    }
    return rows;
  }, [filtered]);

  function select(label: string) {
    onChange(label);
    setOpen(false);
    setQuery('');
  }

  const displayValue = value || null;

  return (
    <>
      <Pressable
        style={[
          s.trigger,
          {
            backgroundColor: c.bgSubtle,
            borderColor: value ? c.fill : c.cardBorder,
          },
        ]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            s.triggerText,
            {
              color: displayValue ? c.textPrimary : c.textTertiary,
              fontFamily: fonts.sansRegular,
            },
          ]}
          numberOfLines={1}
        >
          {displayValue ?? 'Select a sport or league…'}
        </Text>
        <Text style={[s.chevron, { color: c.textTertiary }]}>▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[s.sheet, { backgroundColor: c.bg, paddingTop: Platform.OS === 'ios' ? spacing.lg : insets.top + spacing.lg }]}>
          {/* Header */}
          <View style={[s.sheetHeader, { borderBottomColor: c.separator }]}>
            <Pressable onPress={() => { setOpen(false); setQuery(''); }} style={s.cancelBtn}>
              <Text style={[s.cancelText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Cancel</Text>
            </Pressable>
            <Text style={[s.sheetTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>
              What is being watched?
            </Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Search */}
          <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]}
              placeholder="Search sports and leagues…"
              placeholderTextColor={c.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Text style={{ color: c.textTertiary, fontSize: 14 }}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* List */}
          <FlatList
            data={grouped}
            keyExtractor={(item, i) =>
              item.type === 'header' ? `h-${item.sport}` : `o-${item.option.key}-${i}`
            }
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={[s.sectionHeader, { backgroundColor: c.bgSubtle }]}>
                    <Text style={s.sectionEmoji}>{item.emoji}</Text>
                    <Text style={[s.sectionTitle, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                      {item.sport}
                    </Text>
                  </View>
                );
              }
              const { option } = item;
              const selected = option.label === value;
              return (
                <Pressable
                  style={[
                    s.row,
                    { borderBottomColor: c.separator },
                    selected && { backgroundColor: c.bgSubtle },
                  ]}
                  onPress={() => select(option.label)}
                >
                  <Text
                    style={[
                      s.rowText,
                      {
                        color: selected ? c.textPrimary : c.textPrimary,
                        fontFamily: selected ? fonts.sansSemiBold : fonts.sansRegular,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected && (
                    <Text style={{ color: c.textPrimary, fontSize: 16 }}>✓</Text>
                  )}
                </Pressable>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    height: 52, borderRadius: radius.md, borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  triggerText: { fontSize: 16, flex: 1 },
  chevron: { fontSize: 12, marginLeft: spacing.xs },

  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  cancelBtn: { width: 60 },
  cancelText: { fontSize: 16 },
  sheetTitle: { fontSize: 16 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1,
    paddingHorizontal: spacing.md, height: 44, gap: spacing.sm,
    marginHorizontal: spacing.xl, marginVertical: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15 },

  listContent: { paddingBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 16 },
});
