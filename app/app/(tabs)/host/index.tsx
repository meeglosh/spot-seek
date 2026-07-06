import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light, dark, fonts, spacing, radius, palette } from '../../../lib/theme';

const MOCK_HOST_EVENTS = [
  { id: '1', title: 'Arsenal v Spurs', broadcastSubject: 'Premier League', status: 'published', startsAt: new Date(Date.now() + 3600000 * 24).toISOString(), going: 24, waitlisted: 2, interested: 5 },
  { id: '6', title: 'Cycling: Tour de France Stage 12', broadcastSubject: 'Cycling', status: 'draft', startsAt: new Date(Date.now() + 3600000 * 168).toISOString(), going: 0, waitlisted: 0, interested: 0 },
];

const STATUS_COLOR: Record<string, string> = {
  published: palette.green,
  draft:     palette.gray400,
  cancelled: palette.red,
  completed: palette.gray400,
};

export default function HostDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }]}>Your events</Text>
        <Pressable
          style={[s.createBtn, { backgroundColor: c.fill }]}
          onPress={() => router.push('/(tabs)/host/create')}
        >
          <Text style={[s.createBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>+ New event</Text>
        </Pressable>
      </View>

      {MOCK_HOST_EVENTS.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>Host your first event</Text>
          <Text style={[s.emptyBody, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
            Create a watch party and invite people to join.
          </Text>
          <Pressable
            style={[s.emptyBtn, { backgroundColor: c.fill }]}
            onPress={() => router.push('/(tabs)/host/create')}
          >
            <Text style={[{ color: c.fillText, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Create an event</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={MOCK_HOST_EVENTS}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => {
            const dateStr = new Date(item.startsAt).toLocaleDateString('en-GB', {
              weekday: 'short', day: 'numeric', month: 'short',
            });
            return (
              <View style={[s.eventCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={s.cardTop}>
                  <View style={s.cardMeta}>
                    <Text style={[s.cardSubject, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>
                      {item.broadcastSubject}
                    </Text>
                    <Text style={[s.cardTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>
                      {item.title}
                    </Text>
                    <Text style={[s.cardDate, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                      {dateStr}
                    </Text>
                  </View>
                  <View style={[s.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[item.status], fontFamily: fonts.sansMedium }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                {/* RSVP stats */}
                <View style={[s.statsRow, { borderTopColor: c.separator }]}>
                  {[
                    { label: 'Going', val: item.going, color: palette.green },
                    { label: 'Waitlisted', val: item.waitlisted, color: palette.amber },
                    { label: 'Interested', val: item.interested, color: c.textSecondary },
                  ].map(({ label, val, color }) => (
                    <View key={label} style={s.stat}>
                      <Text style={[s.statVal, { color, fontFamily: fonts.sansBold }]}>{val}</Text>
                      <Text style={[s.statLabel, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
  },
  title: { fontSize: 28 },
  createBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.full },
  createBtnText: { fontSize: 14 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  eventCard: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', padding: spacing.lg, gap: spacing.md },
  cardMeta: { flex: 1, gap: 3 },
  cardSubject: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  cardTitle: { fontSize: 20, lineHeight: 24 },
  cardDate: { fontSize: 13 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, alignSelf: 'flex-start' },
  statusText: { fontSize: 11 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'], gap: spacing.lg },
  emptyTitle: { fontSize: 28, textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { paddingHorizontal: spacing['2xl'], paddingVertical: spacing.md, borderRadius: radius.md },
});
