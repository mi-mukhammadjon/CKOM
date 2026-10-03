import { Platform } from 'react-native';
import { AppData } from '../../types';
import { BACKUP_VERSION, looksLikeBackup, normalizeAppData } from '../normalize';
import { AsyncStorageRepository } from './asyncStorage';
import { SqliteRepository } from './sqlite';
import { AppRepository } from './types';

export type { AppRepository } from './types';
export { BACKUP_VERSION } from '../normalize';

/**
 * На мобильных платформах данные живут в SQLite: добавление одного показания
 * пишет одну строку, а выборки опираются на индексы. В веб-сборке SQLite
 * требует WASM и особых заголовков сервера, поэтому там остается AsyncStorage.
 */
export const repository: AppRepository =
  Platform.OS === 'web' ? new AsyncStorageRepository() : new SqliteRepository();

/** Сериализует текущее состояние в JSON резервной копии */
export function serializeBackup(data: AppData): string {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      ...data,
    },
    null,
    2
  );
}

/**
 * Разбирает JSON резервной копии и приводит его к актуальной схеме.
 * Возвращает null, если это не бэкап СКОМ.
 */
export function parseBackup(jsonString: string): AppData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return null;
  }

  if (!looksLikeBackup(parsed)) return null;
  return normalizeAppData(parsed);
}
