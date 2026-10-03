import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../../types';

/** Ключи хранилища версии 1-2, когда данные лежали в AsyncStorage целыми массивами */
export const LEGACY_KEYS = {
  METERS: '@ckom_meters',
  TARIFFS: '@ckom_tariffs',
  PROPERTIES: '@ckom_properties',
  READINGS: '@ckom_readings',
  PAYMENTS: '@ckom_payments',
  SETTINGS: '@ckom_settings',
  /** Только веб-сборка: в мобильной версии инспекторы хранятся в SQLite */
  INSPECTORS: '@ckom_inspectors',
  MIGRATED: '@ckom_migrated_to_sqlite',
};

function parseOr<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Читает данные прежней версии приложения.
 * Возвращает null, если переносить нечего или перенос уже выполнялся.
 *
 * После успешного переноса старые ключи удаляет purgeLegacyAsyncStorage:
 * данные теперь хранятся только в зашифрованной базе.
 */
export async function readLegacyAsyncStorageData(): Promise<Partial<AppData> | null> {
  try {
    const [migrated, rawMeters, rawTariffs, rawProperties, rawReadings, rawPayments, rawSettings] =
      await AsyncStorage.multiGet([
        LEGACY_KEYS.MIGRATED,
        LEGACY_KEYS.METERS,
        LEGACY_KEYS.TARIFFS,
        LEGACY_KEYS.PROPERTIES,
        LEGACY_KEYS.READINGS,
        LEGACY_KEYS.PAYMENTS,
        LEGACY_KEYS.SETTINGS,
      ]).then(pairs => pairs.map(([, value]) => value));

    if (migrated === 'true') return null;
    // Без счетчиков переносить нечего — это чистая установка
    if (!rawMeters) return null;

    return {
      meters: parseOr(rawMeters, undefined),
      tariffs: parseOr(rawTariffs, undefined),
      properties: parseOr(rawProperties, undefined),
      readings: parseOr(rawReadings, []),
      payments: parseOr(rawPayments, []),
      settings: parseOr(rawSettings, undefined),
    };
  } catch (e) {
    console.warn('Не удалось прочитать данные прежней версии:', e);
    return null;
  }
}

export async function markLegacyMigrated(): Promise<void> {
  try {
    await AsyncStorage.setItem(LEGACY_KEYS.MIGRATED, 'true');
  } catch (e) {
    console.warn('Не удалось отметить перенос данных:', e);
  }
}

/**
 * Удаляет незашифрованные копии данных прежних версий из AsyncStorage.
 * Срабатывает только после подтвержденного переноса в базу; флаг переноса остается.
 */
export async function purgeLegacyAsyncStorage(): Promise<void> {
  try {
    const migrated = await AsyncStorage.getItem(LEGACY_KEYS.MIGRATED);
    if (migrated !== 'true') return;
    await AsyncStorage.multiRemove([
      LEGACY_KEYS.METERS,
      LEGACY_KEYS.TARIFFS,
      LEGACY_KEYS.PROPERTIES,
      LEGACY_KEYS.READINGS,
      LEGACY_KEYS.PAYMENTS,
      LEGACY_KEYS.SETTINGS,
    ]);
  } catch (e) {
    console.warn('Не удалось удалить данные прежней версии:', e);
  }
}
