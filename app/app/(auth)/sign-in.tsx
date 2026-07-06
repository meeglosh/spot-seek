import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { light, dark, fonts, spacing, radius, palette } from '../../lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/(tabs)/discover');
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.inner, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        {/* Back */}
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={[s.backText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>← Back</Text>
        </Pressable>

        <Text style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }]}>
          Welcome back.
        </Text>
        <Text style={[s.subtitle, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Sign in to your SpotSeek account.
        </Text>

        <View style={s.form}>
          <View style={s.field}>
            <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>Email</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="you@example.com"
              placeholderTextColor={c.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
          <View style={s.field}>
            <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>Password</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="••••••••"
              placeholderTextColor={c.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {!!error && (
            <Text style={[s.errorText, { fontFamily: fonts.sansRegular }]}>{error}</Text>
          )}
        </View>

        <View style={s.footer}>
          <Pressable
            style={[s.primaryBtn, { backgroundColor: c.fill, opacity: loading ? 0.6 : 1 }]}
            onPress={handleSignIn}
            disabled={loading}
          >
            <Text style={[s.primaryBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={[s.switchText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
              Don&apos;t have an account?{' '}
              <Text style={{ color: c.textPrimary, fontFamily: fonts.sansSemiBold }}>Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: spacing.xl },
  back: { marginBottom: spacing['2xl'] },
  backText: { fontSize: 16 },
  title: { fontSize: 40, lineHeight: 44, marginBottom: spacing.sm },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: spacing['3xl'] },
  form: { gap: spacing.lg, flex: 1 },
  field: { gap: spacing.sm },
  label: { fontSize: 13, letterSpacing: 0.3 },
  input: {
    height: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    fontSize: 16, borderWidth: 1,
  },
  errorText: { fontSize: 14, color: palette.red },
  footer: { gap: spacing.md },
  primaryBtn: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16 },
  switchText: { fontSize: 14, textAlign: 'center' },
});
