import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Адрес проекта и публичный (anon) ключ подставляются при сборке из переменных
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Anon-ключ публичный
 * по замыслу Supabase: доступ к строкам ограничивают политики RLS, а сами данные
 * зашифрованы на устройстве.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSyncConfigured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;

/** Сессия входа на телефоне хранится в защищенном хранилище, а не в открытом AsyncStorage */
const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // В вебе — стандартное хранилище браузера
        storage: Platform.OS === 'web' ? undefined : secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
