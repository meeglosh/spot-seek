import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { light, dark, fonts, spacing, radius, palette } from '../../../lib/theme';

const MOCK_RSVPS = [
  { id: '1', title: 'Arsenal v Spurs', broadcastSubject: 'Premier League', state: 'going', date: 'Sun 12 Jan' },
  { id: '2', title: 'NFL Sunday RedZone', broadcastSubject: 'NFL', state: 'going', date: 'Mon 13 Jan' },
];

const STATE_COLOR: Record<string, string> = {
  going:      palette.green,
  waitlisted: palette.amber,
  interested: palette.gray400,
  cancelled:  palette.red,
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const auth = useAuth();

  const isAuth = auth.status === 'authenticated';
  const user = isAuth ? auth.user : null;

  if (!isAuth) {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <Text style={[s.unauthTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>Your profile</Text>
        <Text style={[s.unauthBody, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Sign in to track your RSVPs and host events.
        </Text>
        <Pressable
          style={[s.signInBtn, { backgroundColor: c.fill }]}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={[{ color: c.fillText, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.bg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + name */}
      <View style={[s.profileHeader, { paddingTop: insets.top + spacing.lg }]}>
        <View style={[s.avatar, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
          <Text style={[s.avatarInitial, { color: c.textPrimary, fontFamily: fonts.display }]}>
            {user?.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[s.name, { color: c.textPrimary, fontFamily: fonts.display }]}>{user?.name}</Text>
        <Text style={[s.email, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{user?.email}</Text>

        {/* Social stats */}
        <View style={s.stats}>
          {[{ label: 'Following', val: 4 }, { label: 'Followers', val: 12 }].map(({ label, val }) => (
            <View key={label} style={s.stat}>
              <Text style={[s.statVal, { color: c.textPrimary, fontFamily: fonts.sansBold }]}>{val}</Text>
              <Text style={[s.statLabel, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* My RSVPs */}
      <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
        <Text style={[s.sectionTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>My RSVPs</Text>
        {MOCK_RSVPS.length === 0 ? (
          <Text style={[s.emptyText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
            No upcoming RSVPs. Browse events to get started.
          </Text>
        ) : (
          <View style={s.rsvpList}>
            {MOCK_RSVPS.map((r) => (
              <View key={r.id} style={[s.rsvpCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={s.rsvpInfo}>
                  <Text style={[s.rsvpSubject, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>
                    {r.broadcastSubject}
                  </Text>
                  <Text style={[s.rsvpTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={[s.rsvpDate, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{r.date}</Text>
                </View>
                <View style={[s.statePill, { backgroundColor: STATE_COLOR[r.state] + '20' }]}>
                  <Text style={[s.stateText, { color: STATE_COLOR[r.state], fontFamily: fonts.sansMedium }]}>{r.state}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Sign out */}
      <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
        <Pressable
          style={[s.signOutBtn, { borderColor: c.cardBorder }]}
          onPress={() => { auth.signOut(); router.replace('/(auth)'); }}
        >
          <Text style={[s.signOutText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'], gap: spacing.sm },
  avatar: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  avatarInitial: { fontSize: 32 },
  name: { fontSize: 28 },
  email: { fontSize: 14 },
  stats: { flexDirection: 'row', gap: spacing['3xl'], marginTop: spacing.md },
  stat: { alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20 },
  statLabel: { fontSize: 12 },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  sectionTitle: { fontSize: 15 },
  emptyText: { fontSize: 14 },
  rsvpList: { gap: spacing.sm },
  rsvpCard: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.md,
  },
  rsvpInfo: { flex: 1, gap: 2 },
  rsvpSubject: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  rsvpTitle: { fontSize: 14 },
  rsvpDate: { fontSize: 12 },
  statePill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  stateText: { fontSize: 11 },
  signOutBtn: {
    height: 48, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  signOutText: { fontSize: 15 },
  unauthTitle: { fontSize: 32, marginBottom: spacing.sm },
  unauthBody: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280, marginBottom: spacing.xl },
  signInBtn: { paddingHorizontal: spacing['3xl'], paddingVertical: spacing.md, borderRadius: radius.md },
});
