import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** Ключ хранится в Android Keystore / iOS Keychain и не покидает устройство */
const KEY_STORAGE_NAME = 'ckom_db_key_v1';
const KEY_FORMAT = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Читает ключ с повторами. Хранилище ключей иногда отвечает ошибкой или пустым
 * значением сразу после запуска (особенно в фоновой задаче виджета) — одной
 * неудачной попытки недостаточно, чтобы считать ключ потерянным.
 */
async function readKeyWithRetry(): Promise<string | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const value = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (value && KEY_FORMAT.test(value)) return value;
      lastError = null;
    } catch (e) {
      lastError = e;
    }
    await wait(250 * (attempt + 1));
  }
  // Хранилище недоступно — это не «ключа нет»: новый ключ создавать нельзя
  if (lastError) throw lastError;
  return null;
}

/** Ключ только для чтения: виджеты никогда не создают ключ */
export async function readDatabaseKey(): Promise<string | null> {
  return readKeyWithRetry();
}

let pending: Promise<{ key: string; created: boolean }> | null = null;

/**
 * Возвращает 256-битный ключ шифрования базы в виде hex-строки.
 *
 * Новый ключ создается, только если ключа действительно нет. Если при этом файл
 * базы уже существует, создавать ключ нельзя: старая база станет нечитаемой
 * навсегда. Вызывающий код сам решает, что делать (см. SqliteRepository).
 *
 * Параллельные вызовы (приложение и виджет) получают один и тот же результат.
 */
export function getOrCreateDatabaseKey(databaseExists: boolean): Promise<{ key: string; created: boolean }> {
  if (!pending) {
    pending = (async () => {
      const existing = await readKeyWithRetry();
      if (existing) return { key: existing, created: false };
      if (databaseExists) {
        throw new Error('DATABASE_KEY_MISSING');
      }
      const key = toHex(Crypto.getRandomBytes(32));
      await SecureStore.setItemAsync(KEY_STORAGE_NAME, key, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      return { key, created: true };
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/**
 * Заменяет ключ новым — только когда пользователь согласился начать с чистой базы,
 * потому что прежний ключ потерян. Старый файл базы при этом не удаляется.
 */
export async function createReplacementKey(): Promise<string> {
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_STORAGE_NAME, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return key;
}
