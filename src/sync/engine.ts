import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppData } from '../types';
import { normalizeAppData } from '../services/normalize';
import { AppRepository } from '../services/db/types';
import {
  decryptVault,
  deriveAuthSecret,
  deriveVaultKey,
  encryptVault,
  fromBase64,
  fromHex,
  toBase64,
  toHex,
  VAULT_KDF_ITERATIONS,
} from './crypto';
import { mergeAppData, stableStringify } from './merge';
import { getSupabase } from './supabase';

const VAULT_TABLE = 'vaults';
const STATE_KEY = '@ckom_sync_state';
const KEY_STORAGE = 'ckom_sync_vault_key';
const BASE_META = 'sync_base';
const VAULT_FORMAT = 1;

/** Состояние синхронизации без секретов — можно держать в AsyncStorage */
export interface SyncState {
  email: string;
  deviceId: string;
  /** Версия облачной копии после последней успешной синхронизации */
  lastVersion: number;
  lastSyncedAt: string | null;
}

interface VaultKey {
  key: string; // hex
  salt: string; // base64
  iterations: number;
}

interface VaultRow {
  user_id: string;
  version: number;
  kdf_salt: string;
  kdf_iterations: number;
  iv: string;
  ciphertext: string;
  device_id: string | null;
  updated_at: string;
}

export type SyncErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_SIGNED_IN'
  | 'NEED_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'USER_EXISTS'
  | 'NETWORK'
  | 'CONFLICT'
  | 'UNKNOWN';

export class SyncError extends Error {
  constructor(public code: SyncErrorCode, message?: string) {
    super(message ?? code);
  }
}

// ---------- Локальное состояние ----------

export async function loadSyncState(): Promise<SyncState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as SyncState) : null;
  } catch {
    return null;
  }
}

async function saveSyncState(state: SyncState | null): Promise<void> {
  if (state) await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  else await AsyncStorage.removeItem(STATE_KEY);
}

/** Ключ шифрования: на телефоне — в защищенном хранилище, в вебе — в браузере */
async function loadVaultKey(): Promise<VaultKey | null> {
  try {
    const raw =
      Platform.OS === 'web'
        ? await AsyncStorage.getItem(KEY_STORAGE)
        : await SecureStore.getItemAsync(KEY_STORAGE);
    return raw ? (JSON.parse(raw) as VaultKey) : null;
  } catch {
    return null;
  }
}

async function saveVaultKey(value: VaultKey | null): Promise<void> {
  const raw = value ? JSON.stringify(value) : null;
  if (Platform.OS === 'web') {
    if (raw) await AsyncStorage.setItem(KEY_STORAGE, raw);
    else await AsyncStorage.removeItem(KEY_STORAGE);
  } else if (raw) {
    await SecureStore.setItemAsync(KEY_STORAGE, raw);
  } else {
    await SecureStore.deleteItemAsync(KEY_STORAGE);
  }
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new SyncError('NOT_CONFIGURED');
  return supabase;
}

/** Сетевые ошибки отличаем от остальных, чтобы показать «нет интернета» */
function asSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const message = String((error as Error)?.message ?? error);
  if (/network|fetch|timeout|Failed to fetch/i.test(message)) return new SyncError('NETWORK', message);
  return new SyncError('UNKNOWN', message);
}

async function currentUserId(): Promise<string> {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new SyncError('NOT_SIGNED_IN');
  return id;
}

async function fetchVault(userId: string): Promise<VaultRow | null> {
  const { data, error } = await client()
    .from(VAULT_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw asSyncError(error);
  return (data as VaultRow | null) ?? null;
}

/** Готовит ключ шифрования по паролю и соли облачной копии (или создает новую соль) */
async function prepareKey(password: string, vault: VaultRow | null): Promise<VaultKey> {
  const salt = vault ? fromBase64(vault.kdf_salt) : Crypto.getRandomBytes(16);
  const iterations = vault?.kdf_iterations ?? VAULT_KDF_ITERATIONS;
  const key = await deriveVaultKey(password, salt, iterations);

  // Проверяем пароль на существующей копии: неверный ключ не пройдет проверку GCM
  if (vault) {
    try {
      decryptVault({ iv: vault.iv, ciphertext: vault.ciphertext }, key);
    } catch {
      throw new SyncError('WRONG_PASSWORD');
    }
  }
  return { key: toHex(key), salt: toBase64(salt), iterations };
}

// ---------- Вход и регистрация ----------

export async function signUp(email: string, password: string): Promise<'ready' | 'confirm_email'> {
  try {
    const secret = await deriveAuthSecret(password, email);
    const { data, error } = await client().auth.signUp({ email: email.trim(), password: secret });
    if (error) {
      if (/registered|exists/i.test(error.message)) throw new SyncError('USER_EXISTS');
      throw asSyncError(error);
    }
    if (!data.session) return 'confirm_email';
    await finishSignIn(email, password);
    return 'ready';
  } catch (e) {
    throw asSyncError(e);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  try {
    const secret = await deriveAuthSecret(password, email);
    const { error } = await client().auth.signInWithPassword({ email: email.trim(), password: secret });
    if (error) {
      if (/confirm/i.test(error.message)) throw new SyncError('EMAIL_NOT_CONFIRMED');
      if (/invalid/i.test(error.message)) throw new SyncError('INVALID_CREDENTIALS');
      throw asSyncError(error);
    }
    await finishSignIn(email, password);
  } catch (e) {
    throw asSyncError(e);
  }
}

async function finishSignIn(email: string, password: string): Promise<void> {
  const userId = await currentUserId();
  const vault = await fetchVault(userId);
  await saveVaultKey(await prepareKey(password, vault));
  const previous = await loadSyncState();
  await saveSyncState({
    email: email.trim(),
    deviceId: previous?.deviceId ?? toHex(Crypto.getRandomBytes(8)),
    // Новое устройство еще не видело облачную копию: первая синхронизация сольет данные
    lastVersion: 0,
    lastSyncedAt: null,
  });
}

/** Выход: локальные данные остаются, удаляются только сессия, ключ и база синхронизации */
export async function signOut(repository: AppRepository): Promise<void> {
  try {
    await getSupabase()?.auth.signOut();
  } catch {
    // без сети выход все равно выполняется локально
  }
  await saveVaultKey(null);
  await saveSyncState(null);
  await repository.setMeta(BASE_META, null);
}

// ---------- Синхронизация ----------

export interface SyncResult {
  status: 'pushed' | 'pulled' | 'merged' | 'unchanged';
  /** Данные, которые нужно применить на устройстве (если пришли изменения) */
  data?: AppData;
  conflicts: number;
  syncedAt: string;
}

function encodeForCloud(data: AppData, vaultKey: VaultKey) {
  const json = JSON.stringify({ format: VAULT_FORMAT, data });
  return encryptVault(json, fromHex(vaultKey.key), Crypto.getRandomBytes(12));
}

function decodeFromCloud(row: VaultRow, vaultKey: VaultKey): AppData {
  try {
    const parsed = JSON.parse(decryptVault({ iv: row.iv, ciphertext: row.ciphertext }, fromHex(vaultKey.key)));
    return normalizeAppData(parsed.data);
  } catch {
    // Пароль сменили на другом устройстве — нужен новый пароль
    throw new SyncError('NEED_PASSWORD');
  }
}

/**
 * Синхронизирует данные устройства с облачной копией.
 *
 * Запись идет с проверкой версии (оптимистичная блокировка): если другое
 * устройство успело записать раньше, копия перечитывается и сливается заново.
 */
export async function syncNow(local: AppData, repository: AppRepository): Promise<SyncResult> {
  try {
    const state = await loadSyncState();
    const vaultKey = await loadVaultKey();
    if (!state) throw new SyncError('NOT_SIGNED_IN');
    if (!vaultKey) throw new SyncError('NEED_PASSWORD');
    const userId = await currentUserId();

    const baseRaw = await repository.getMeta(BASE_META);
    const base = baseRaw ? (JSON.parse(baseRaw) as AppData) : null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await fetchVault(userId);
      const syncedAt = new Date().toISOString();

      // Облачной копии еще нет — отправляем данные устройства
      if (!remote) {
        const payload = encodeForCloud(local, vaultKey);
        const { error } = await client().from(VAULT_TABLE).insert({
          user_id: userId,
          version: 1,
          kdf_salt: vaultKey.salt,
          kdf_iterations: vaultKey.iterations,
          iv: payload.iv,
          ciphertext: payload.ciphertext,
          device_id: state.deviceId,
        });
        if (error) {
          if (/duplicate/i.test(error.message)) continue; // другое устройство успело первым
          throw asSyncError(error);
        }
        await finish(repository, state, 1, local, syncedAt);
        return { status: 'pushed', conflicts: 0, syncedAt };
      }

      const remoteChanged = remote.version !== state.lastVersion;
      const localChanged = !base || stableStringify(base) !== stableStringify(local);

      if (!remoteChanged && !localChanged) {
        await finish(repository, state, remote.version, local, syncedAt);
        return { status: 'unchanged', conflicts: 0, syncedAt };
      }

      let next = local;
      let conflicts = 0;
      let status: SyncResult['status'] = 'pushed';

      if (remoteChanged) {
        const remoteData = decodeFromCloud(remote, vaultKey);
        if (!localChanged && base) {
          next = remoteData;
          status = 'pulled';
        } else {
          const merged = mergeAppData(base, local, remoteData);
          next = normalizeAppData(merged.data);
          conflicts = merged.stats.conflicts;
          status = 'merged';
        }
      }

      // Отправляем, если в облаке нет того, что теперь будет на устройстве
      if (status !== 'pulled') {
        const payload = encodeForCloud(next, vaultKey);
        const { data, error } = await client()
          .from(VAULT_TABLE)
          .update({
            version: remote.version + 1,
            iv: payload.iv,
            ciphertext: payload.ciphertext,
            device_id: state.deviceId,
            updated_at: syncedAt,
          })
          .eq('user_id', userId)
          .eq('version', remote.version)
          .select('version');
        if (error) throw asSyncError(error);
        if (!data || data.length === 0) continue; // кто-то записал между чтением и записью
        await finish(repository, state, remote.version + 1, next, syncedAt);
      } else {
        await finish(repository, state, remote.version, next, syncedAt);
      }

      return {
        status,
        data: next === local ? undefined : next,
        conflicts,
        syncedAt,
      };
    }
    throw new SyncError('CONFLICT');
  } catch (e) {
    throw asSyncError(e);
  }
}

async function finish(
  repository: AppRepository,
  state: SyncState,
  version: number,
  data: AppData,
  syncedAt: string
): Promise<void> {
  await repository.setMeta(BASE_META, JSON.stringify(data));
  await saveSyncState({ ...state, lastVersion: version, lastSyncedAt: syncedAt });
}

/** Удаляет облачную копию (данные на устройстве не трогает) */
export async function deleteCloudCopy(repository: AppRepository): Promise<void> {
  try {
    const userId = await currentUserId();
    const { error } = await client().from(VAULT_TABLE).delete().eq('user_id', userId);
    if (error) throw asSyncError(error);
    await repository.setMeta(BASE_META, null);
    const state = await loadSyncState();
    if (state) await saveSyncState({ ...state, lastVersion: 0, lastSyncedAt: null });
  } catch (e) {
    throw asSyncError(e);
  }
}
