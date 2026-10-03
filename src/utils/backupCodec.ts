import { gzip, ungzip } from 'pako';
import { utf8Decode, utf8Encode } from './utf8';

/** Сжимает JSON резервной копии в gzip: размер файла уменьшается в несколько раз */
export function compressBackup(json: string): Uint8Array {
  return gzip(utf8Encode(json), { level: 9 });
}

/** Признак gzip-файла: первые два байта 1f 8b */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Читает резервную копию: сжатую (.json.gz) или обычный JSON прежних версий */
export function decodeBackup(bytes: Uint8Array): string {
  return utf8Decode(isGzip(bytes) ? ungzip(bytes) : bytes);
}
