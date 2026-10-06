import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../../lib/api';
import { colors, palette, spacing, type as t } from '../../lib/theme';
import { Btn, FieldLabel, inputStyle, inputFocusedStyle } from '../../components/ui';

// Requests a password-reset email. The server never reveals whether the email
// has an account, so on success we always show the same neutral confirmation.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch {
      setError(tr('forgot.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.inner, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={8}>
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>{tr('forgot.backToSignIn')}</Text>
        </Pressable>

        <Text style={[t.headlineLg, s.title]}>{tr('forgot.title')}</Text>
        <Text style={[t.bodyMd, s.subtitle]}>{tr('forgot.subtitle')}</Text>

        {sent ? (
          <View style={s.sentBox} accessibilityRole="alert">
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('forgot.sent')}</Text>
          </View>
        ) : (
          <>
            <View style={s.form}>
              <FieldLabel>{tr('forgot.emailLabel')}</FieldLabel>
              <TextInput
                style={[inputStyle, focused && inputFocusedStyle]}
                placeholder={tr('forgot.emailPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="username"
              />
              {!!error && <Text style={[t.bodySm, s.errorText]}>{error}</Text>}
            </View>
            <Btn
              label={loading ? tr('forgot.submitLoading') : tr('forgot.submitLabel')}
              onPress={handleSubmit}
              disabled={loading || !email.trim()}
            />
          </>
        )}
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
    marginBottom: spacing.sm,
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  subtitle: { color: colors.textSecondary, marginBottom: spacing['3xl'] },
  form: { marginBottom: spacing['2xl'], gap: spacing.sm },
  errorText: { color: colors.danger },
  sentBox: {
    borderWidth: 1, borderColor: colors.accent, backgroundColor: palette.surfaceMid,
    padding: spacing.lg,
  },
});
