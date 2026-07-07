import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { light, dark, fonts, spacing, radius, palette } from '../../lib/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp() {
    if (!name || !email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signUp(name, email, password);
      // Route through interests onboarding before landing on Discover.
      router.replace('/(auth)/interests');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.inner, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={[s.backText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>← Back</Text>
        </Pressable>

        <Text style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }]}>
          Join SpotSeek.
        </Text>
        <Text style={[s.subtitle, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Create an account to host or discover watch parties.
        </Text>

        <View style={s.form}>
          {([
            { label: 'Name', value: name, setter: setName, placeholder: 'Your name', type: 'name', secure: false },
            { label: 'Email', value: email, setter: setEmail, placeholder: 'you@example.com', type: 'email', secure: false },
            { label: 'Password', value: password, setter: setPassword, placeholder: '8+ characters', type: 'password', secure: true },
          ] as const).map(({ label, value, setter, placeholder, secure }) => (
            <View key={label} style={s.field}>
              <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>{label}</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
                placeholder={placeholder}
                placeholderTextColor={c.textTertiary}
                value={value}
                onChangeText={setter}
                secureTextEntry={secure}
                autoCapitalize={label === 'Name' ? 'words' : 'none'}
                keyboardType={label === 'Email' ? 'email-address' : 'default'}
              />
            </View>
          ))}

          {!!error && (
            <Text style={[s.errorText, { fontFamily: fonts.sansRegular }]}>{error}</Text>
          )}
        </View>

        <View style={s.footer}>
          <Pressable
            style={[s.primaryBtn, { backgroundColor: c.fill, opacity: loading ? 0.6 : 1 }]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={[s.primaryBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
              {loading ? 'Creating account…' : 'Create account'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/sign-in')}>
            <Text style={[s.switchText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
              Already have an account?{' '}
              <Text style={{ color: c.textPrimary, fontFamily: fonts.sansSemiBold }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, paddingHorizontal: spacing.xl },
  back: { marginBottom: spacing['2xl'] },
  backText: { fontSize: 16 },
  title: { fontSize: 40, lineHeight: 44, marginBottom: spacing.sm },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: spacing['3xl'] },
  form: { gap: spacing.lg, marginBottom: spacing['2xl'] },
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
