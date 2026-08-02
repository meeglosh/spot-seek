import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, fonts, palette, spacing, type as t } from '../../lib/theme';
import { Badge, Btn, FieldLabel, inputStyle, inputFocusedStyle } from '../../components/ui';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  // Where to land after auth — back to the gated screen, or Discover by default.
  const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/(tabs)/discover';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  async function handleSignIn() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace(target as never);
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.inner, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={8}>
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>← Back</Text>
        </Pressable>

        <Badge label="Secure connection" tone="live" />
        <Text style={[t.headlineLg, s.title]}>Welcome{'\n'}back</Text>
        <Text style={[t.bodyMd, s.subtitle]}>Sign in to your SpotSeek account.</Text>

        <View style={s.form}>
          <View style={s.field}>
            <FieldLabel>Email address</FieldLabel>
            <TextInput
              style={[inputStyle, focused === 'email' && inputFocusedStyle]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
            />
          </View>
          <View style={s.field}>
            <FieldLabel>Password</FieldLabel>
            <TextInput
              style={[inputStyle, focused === 'password' && inputFocusedStyle]}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry
              autoComplete="password"
              // Without this, iOS has no signal that a sign-in field is
              // reusing an *existing* credential rather than entering a new
              // one, and 1Password/Keychain prompt "Update Password?" on
              // every successful sign-in even when it's unchanged.
              textContentType="password"
            />
          </View>

          {!!error && (
            <Text style={[t.bodySm, s.errorText]}>{error}</Text>
          )}
        </View>

        <View style={s.footer}>
          <Btn
            label={loading ? 'Signing in…' : 'Sign in →'}
            onPress={handleSignIn}
            disabled={loading}
          />
          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/sign-up', params: redirect ? { redirect } : {} } as never)}
            hitSlop={8}
          >
            <Text style={[t.bodySm, s.switchText]}>
              Don&apos;t have an account?{' '}
              <Text style={s.switchLink}>Sign up</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace(target as never)}
            hitSlop={8}
            style={s.skipLink}
            accessibilityLabel="Skip for now"
          >
            <Text style={[t.labelCaps, { color: colors.textSecondary }]}>Skip for now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // flexGrow (not flex) — a ScrollView's content must be free to exceed the
  // viewport height when the keyboard shrinks available space, not forced to
  // fit it. flex:1 here previously collapsed the form to near-zero height
  // whenever the keyboard opened, since this View had no ScrollView to
  // overflow into — the footer (Sign in / Skip) rendered directly on top of
  // the squeezed-out email/password fields.
  inner: { flexGrow: 1, paddingHorizontal: spacing.xl },
  back: { marginBottom: spacing['2xl'], alignSelf: 'flex-start' },
  title: {
    color: palette.white,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  subtitle: { color: colors.textSecondary, marginBottom: spacing['3xl'] },
  form: { gap: spacing.xl, marginBottom: spacing['2xl'], flexGrow: 1 },
  field: { gap: 0 },
  errorText: { color: colors.danger },
  footer: { gap: spacing.lg },
  switchText: { color: colors.textSecondary, textAlign: 'center' },
  switchLink: { color: colors.accent, fontFamily: fonts.sansBold },
  skipLink: { alignItems: 'center', paddingTop: spacing.sm },
});
