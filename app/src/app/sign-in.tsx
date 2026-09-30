import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { BRAND, colors, font, radius, space } from '../lib/theme';

/** Passwordless sign-in: email -> 6-digit code. Nothing to forget, so switching phones is always possible. */
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      setError(err.status === 429 ? 'Too many codes requested. Please wait a few minutes.' : err.message);
      return;
    }
    setEmail(address);
    setStep('code');
    setResendIn(60);
  };

  const verify = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) {
      setError('Enter the code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) setError('That code is wrong or has expired. Check the latest email or send a new code.');
    // On success the session listener in the root layout switches to the app.
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={40} color={colors.text} />
        </View>
        <Text style={[font.title, styles.center]}>{BRAND.name}</Text>
        <Text style={[styles.muted, styles.center]}>{BRAND.tagline}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="cloud-done" size={22} color={colors.up} />
            <Text style={styles.cardTitle}>Your collection, safe in the cloud</Text>
          </View>
          <Text style={styles.muted}>
            Cars, photos, value history, what you paid and your own valuations are all backed up to your account. Get a new
            phone? Sign in with the same email and everything is there.
          </Text>
        </View>

        {!supabaseConfigured ? (
          <Text style={styles.error}>
            Cloud sync is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see docs/SETUP.md).
          </Text>
        ) : step === 'email' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              style={styles.input}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Email me a sign-in code" icon="mail" onPress={sendCode} loading={busy} />
            <Text style={[styles.hint, styles.center]}>No password needed. New here? This creates your account.</Text>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.muted}>
              We sent a code to <Text style={{ color: colors.text, fontWeight: '700' }}>{email}</Text>.
            </Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="123456"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={verify}
              autoFocus
              style={[styles.input, styles.code]}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button title="Sign in" icon="log-in" onPress={verify} loading={busy} />
            <View style={styles.links}>
              <Button title="Different email" variant="ghost" onPress={() => { setStep('email'); setCode(''); setError(null); }} style={{ flex: 1 }} />
              <Button
                title={resendIn > 0 ? `Resend (${resendIn}s)` : 'Resend code'}
                variant="ghost"
                disabled={resendIn > 0 || busy}
                onPress={sendCode}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, gap: space.lg, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: { textAlign: 'center', color: colors.text },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  form: { gap: space.md },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  code: { fontSize: 26, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
  error: { color: colors.down, fontSize: 14 },
  hint: { color: colors.textDim, fontSize: 12 },
  links: { flexDirection: 'row', gap: space.sm },
});
