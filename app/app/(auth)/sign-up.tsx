import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, fonts, palette, spacing, type as t } from '../../lib/theme';
import { Badge, Btn, FieldLabel, inputStyle, inputFocusedStyle } from '../../components/ui';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  async function handleSignUp() {
    if (!name || !email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signUp(name, email, password);
      // Route through interests onboarding; carry the redirect so onboarding
      // returns the user to whatever screen originally gated them.
      router.replace({ pathname: '/(auth)/interests', params: redirect ? { redirect } : {} } as never);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.');
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
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={8}>
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>← Back</Text>
        </Pressable>

        <Badge label="Secure connection" tone="live" />
        <Text style={[t.headlineLg, s.title]}>Join the{'\n'}action</Text>
        <Text style={[t.bodyMd, s.subtitle]}>Create an account to host or discover watch parties.</Text>

        <View style={s.form}>
          {([
            {
              label: 'Name', value: name, setter: setName, placeholder: 'Your name', secure: false,
              autoComplete: 'name' as const, textContentType: 'name' as const,
            },
            {
              label: 'Email address', value: email, setter: setEmail, placeholder: 'you@example.com', secure: false,
              autoComplete: 'email' as const, textContentType: 'username' as const,
            },
            {
              label: 'Password', value: password, setter: setPassword, placeholder: '8+ characters', secure: true,
              autoComplete: 'new-password' as const, textContentType: 'newPassword' as const,
            },
          ]).map(({
            label, value, setter, placeholder, secure, autoComplete, textContentType,
          }) => (
            <View key={label} style={s.field}>
              <FieldLabel>{label}</FieldLabel>
              <TextInput
                style={[inputStyle, focused === label && inputFocusedStyle]}
                placeholder={placeholder}
                placeholderTextColor={colors.textTertiary}
                value={value}
                onChangeText={setter}
                onFocus={() => setFocused(label)}
                onBlur={() => setFocused(null)}
                secureTextEntry={secure}
                autoCapitalize={label === 'Name' ? 'words' : 'none'}
                keyboardType={label === 'Email address' ? 'email-address' : 'default'}
                autoComplete={autoComplete}
                // "newPassword" (as opposed to sign-in's "password") tells
                // iOS this is account creation, so 1Password/Keychain offer
                // to generate+save a new credential instead of asking to
                // update an existing one.
                textContentType={textContentType}
              />
            </View>
          ))}

          {!!error && (
            <Text style={[t.bodySm, s.errorText]}>{error}</Text>
          )}
        </View>

        <View style={s.footer}>
          <Btn
            label={loading ? 'Creating account…' : 'Create account →'}
            onPress={handleSignUp}
            disabled={loading}
          />
          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/sign-in', params: redirect ? { redirect } : {} } as never)}
            hitSlop={8}
          >
            <Text style={[t.bodySm, s.switchText]}>
              Already have an account?{' '}
              <Text style={s.switchLink}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
});
