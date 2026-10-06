import React, { useState } from 'react';
import { View, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text } from '../../components/Text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { getOnboardingSeen } from '../../lib/api';
import { colors, fonts, spacing, type as t } from '../../lib/theme';
import { BackLink, Btn, FieldLabel, inputStyle, inputFocusedStyle, Press } from '../../components/ui';
import { openGuidelines } from '../../lib/moderation';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { redirect, context } = useLocalSearchParams<{ redirect?: string; context?: string }>();
  const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/(tabs)/discover';
  // Scoped to the 'auth' namespace — tr()/t() calls below read
  // locales/<lang>/auth.json. Aliased to `tr` because this file already
  // uses `t` for theme.type tokens imported from ../../lib/theme. See
  // lib/i18n.ts for the full key-naming convention.
  const { t: tr } = useTranslation('auth');

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
      // Someone who went through first-run onboarding has already picked
      // interests as a guest (synced by AuthProvider), so go straight back to
      // where they were. Anyone who hasn't gets the interests step first.
      const seen = await getOnboardingSeen().catch(() => true);
      if (seen) router.dismissTo(target as never);
      else router.replace({ pathname: '/(auth)/interests', params: { redirect: target } } as never);
    } catch (err) {
      setError((err as Error).message || tr('signUp.errorFallback'));
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
        <View style={s.back}>
          <BackLink label={tr('back')} onPress={() => router.back()} />
        </View>

        <Text style={[t.headlineLg, s.title]}>{tr('signUp.title')}</Text>
        <Text style={[t.bodyMd, s.subtitle]}>{context || tr('signUp.subtitle')}</Text>

        <View style={s.form}>
          {([
            {
              id: 'name' as const, label: tr('signUp.nameLabel'), value: name, setter: setName,
              placeholder: tr('signUp.namePlaceholder'), secure: false,
              autoComplete: 'name' as const, textContentType: 'name' as const,
            },
            {
              id: 'email' as const, label: tr('signUp.emailLabel'), value: email, setter: setEmail,
              placeholder: tr('signUp.emailPlaceholder'), secure: false,
              autoComplete: 'email' as const, textContentType: 'username' as const,
            },
            {
              id: 'password' as const, label: tr('signUp.passwordLabel'), value: password, setter: setPassword,
              placeholder: tr('signUp.passwordPlaceholder'), secure: true,
              autoComplete: 'new-password' as const, textContentType: 'newPassword' as const,
            },
          ]).map(({
            id, label, value, setter, placeholder, secure, autoComplete, textContentType,
          }) => (
            <View key={id} style={s.field}>
              <FieldLabel>{label}</FieldLabel>
              <TextInput
                style={[inputStyle, focused === id && inputFocusedStyle]}
                placeholder={placeholder}
                placeholderTextColor={colors.textTertiary}
                value={value}
                onChangeText={setter}
                onFocus={() => setFocused(id)}
                onBlur={() => setFocused(null)}
                secureTextEntry={secure}
                autoCapitalize={id === 'name' ? 'words' : 'none'}
                keyboardType={id === 'email' ? 'email-address' : 'default'}
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
            label={loading ? tr('signUp.submitLoading') : tr('signUp.submitLabel')}
            onPress={handleSignUp}
            disabled={loading}
          />
          <Text style={[t.bodySm, s.agreeText]}>
            {tr('signUp.agreeBefore')}
            <Text style={s.agreeLink} onPress={openGuidelines} accessibilityRole="link">{tr('signUp.agreeLink')}</Text>
            {tr('signUp.agreeAfter')}
          </Text>
          <Press
            onPress={() => router.push({ pathname: '/(auth)/sign-in', params: { ...(redirect ? { redirect } : {}), ...(context ? { context } : {}) } } as never)}
            hitSlop={8}
          >
            <Text style={[t.bodySm, s.switchText]}>
              {tr('signUp.switchPrompt')}{' '}
              <Text style={s.switchLink}>{tr('signUp.switchLink')}</Text>
            </Text>
          </Press>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  inner: { flexGrow: 1, paddingHorizontal: spacing.xl },
  back: { marginBottom: spacing['2xl'], alignSelf: 'flex-start' },
  title: {
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  subtitle: { color: colors.textSecondary, marginBottom: spacing['3xl'] },
  form: { gap: spacing.xl, marginBottom: spacing['2xl'], flexGrow: 1 },
  field: { gap: 0 },
  errorText: { color: colors.danger },
  footer: { gap: spacing.lg },
  agreeText: { color: colors.textTertiary, textAlign: 'center' },
  agreeLink: { color: colors.actionMuted, textDecorationLine: 'underline' },
  switchText: { color: colors.textSecondary, textAlign: 'center' },
  switchLink: { color: colors.action, fontFamily: fonts.sansBold },
});
