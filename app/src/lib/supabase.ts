import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the Supabase project URL and key are set (see docs/SETUP.md). */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const PHOTO_BUCKET = 'car-photos';

// Refresh the session only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

interface AuthState {
  session: Session | null;
  ready: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, ready: false }));

supabase.auth
  .getSession()
  .then(({ data }) => useAuth.setState({ session: data.session, ready: true }))
  .catch(() => useAuth.setState({ ready: true }));
supabase.auth.onAuthStateChange((_event, session) => useAuth.setState({ session, ready: true }));

export const currentUserId = () => useAuth.getState().session?.user.id ?? null;
