import { AppData, AppSettings, Inspector, Meter, Payment, Property, ReadingEntry, Tariff } from '../../types';

/**
 * Хранилище приложения. Реализации: SQLite (мобильные платформы)
 * и AsyncStorage (веб, где SQLite недоступен без особой настройки сервера).
 *
 * Операции над отдельными сущностями специально сделаны построчными: добавление
 * одного показания не должно перезаписывать всю историю.
 */
/** Копия базы или отложенный файл, из которого можно восстановить данные */
export interface RecoveryCandidate {
  name: string;
  /** snapshot — автоматическая копия, unreadable — отложенная основная база, recovered — база прежней версии */
  kind: 'snapshot' | 'unreadable' | 'recovered';
  /** Время создания, мс */
  createdAt: number;
  readable: boolean;
  properties: number;
  readings: number;
  payments: number;
  lastReadingDate: string;
}

export interface AppRepository {
  /** Открывает хранилище, при необходимости создает схему и переносит старые данные */
  init(): Promise<AppData>;

  /** Полная перезапись (импорт бэкапа, сброс, загрузка демо) */
  replaceAll(data: AppData): Promise<void>;

  upsertProperty(property: Property): Promise<void>;
  deleteProperty(id: string): Promise<void>;

  upsertMeters(meters: Meter[]): Promise<void>;
  deleteMeter(id: string): Promise<void>;

  insertReading(reading: ReadingEntry): Promise<void>;
  updateReading(reading: ReadingEntry): Promise<void>;
  deleteReading(id: string): Promise<void>;
  deleteReadingsByMeter(meterId: string): Promise<void>;

  insertPayment(payment: Payment): Promise<void>;
  updatePayment(payment: Payment): Promise<void>;
  deletePayment(id: string): Promise<void>;

  upsertInspector(inspector: Inspector): Promise<void>;
  deleteInspector(id: string): Promise<void>;

  replaceTariffs(tariffs: Tariff[]): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;

  /** Зашифрованная копия всей базы перед рискованными операциями */
  createSnapshot(reason: string): Promise<void>;
  ensureDailySnapshot(): Promise<void>;
  listRecoveryCandidates(): Promise<RecoveryCandidate[]>;
  readRecoveryCandidate(name: string): Promise<AppData>;

  /** Служебные значения (например, база для синхронизации) — хранятся вместе с данными */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;

  /** Человекочитаемое имя бэкенда — показываем в настройках */
  readonly backend: 'sqlite' | 'async-storage';
}
