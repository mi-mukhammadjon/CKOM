import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gzip, ungzip } from 'pako';
import { utf8Decode, utf8Encode } from '../utils/utf8';

/**
 * Сквозное шифрование облачной копии.
 *
 * Из пароля пользователя выводятся два независимых секрета:
 *  - секрет входа (уходит в Supabase как пароль учетной записи);
 *  - ключ шифрования (не покидает устройство).
 * Зная секрет входа, нельзя получить ключ шифрования: соли и назначение разные.
 * Поэтому ни Supabase, ни владелец сервера не могут прочитать данные.
 */

/** Итерации PBKDF2-SHA256 для ключа шифрования */
export const VAULT_KDF_ITERATIONS = 200_000;
/** Итерации для секрета входа — он дополнительно хешируется на стороне Supabase */
const AUTH_KDF_ITERATIONS = 100_000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 без btoa/Buffer — одинаково работает в Hermes, вебе и тестах */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byte = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    bytes[byte++] = (n >> 16) & 255;
    if (i + 2 < clean.length) bytes[byte++] = (n >> 8) & 255;
    if (i + 3 < clean.length) bytes[byte++] = n & 255;
  }
  return bytes.slice(0, byte);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Секрет входа в Supabase: зависит от пароля и email, но не от соли хранилища */
export async function deriveAuthSecret(password: string, email: string): Promise<string> {
  const salt = utf8Encode(`ckom-auth:${email.trim().toLowerCase()}`);
  const key = await pbkdf2Async(sha256, utf8Encode(password), salt, {
    c: AUTH_KDF_ITERATIONS,
    dkLen: 32,
  });
  return toHex(key);
}

/** Ключ шифрования хранилища (32 байта) */
export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iterations = VAULT_KDF_ITERATIONS
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8Encode(password), salt, { c: iterations, dkLen: 32 });
}

export interface EncryptedVault {
  iv: string;
  ciphertext: string;
}

/** Сжимает и шифрует JSON: AES-256-GCM, случайный 12-байтовый IV на каждую запись */
export function encryptVault(json: string, key: Uint8Array, iv: Uint8Array): EncryptedVault {
  const packed = gzip(utf8Encode(json), { level: 9 });
  const ciphertext = gcm(key, iv).encrypt(packed);
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** Расшифровывает хранилище. Неверный пароль → ошибка проверки тега GCM */
export function decryptVault(vault: EncryptedVault, key: Uint8Array): string {
  const packed = gcm(key, fromBase64(vault.iv)).decrypt(fromBase64(vault.ciphertext));
  return utf8Decode(ungzip(packed));
}
