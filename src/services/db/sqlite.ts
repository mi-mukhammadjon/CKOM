import * as SQLite from 'expo-sqlite';
import { Directory, File } from 'expo-file-system';
import {
  AppData,
  AppSettings,
  Inspector,
  Meter,
  MeterType,
  Payment,
  PaymentMethod,
  Property,
  ReadingEntry,
  Tariff,
} from '../../types';
import { DEFAULT_SETTINGS } from '../../constants/defaults';
import { cleanAppData, normalizeAppData } from '../normalize';
import { readLegacyAsyncStorageData, markLegacyMigrated, purgeLegacyAsyncStorage } from './legacy';
import { createReplacementKey, getOrCreateDatabaseKey, readDatabaseKey } from './encryptionKey';
import { RecoveryCandidate } from './types';
import { AppRepository } from './types';

/** Зашифрованная база (SQLCipher, AES-256) */
const DATABASE_NAME = 'ckom-secure.db';
/** Незашифрованная база версий до появления шифрования — переносится и удаляется */
const PLAIN_DATABASE_NAME = 'ckom.db';

/** Автоматические зашифрованные копии базы */
const SNAPSHOT_PREFIX = 'ckom-snapshot-';
/** База, которую не удалось открыть текущим ключом, — откладывается, не удаляется */
const UNREADABLE_PREFIX = 'ckom-secure.unreadable-';
/** Открытая база прежней версии, найденная рядом с уже зашифрованной */
const RECOVERED_PREFIX = 'ckom-secure.recovered-';
const MAX_SNAPSHOTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Ошибка «ключ не подходит / файл не база» — в отличие от временной блокировки */
function isNotADatabase(error: unknown): boolean {
  return /not a database|file is encrypted|SQLITE_NOTADB/i.test(String((error as Error)?.message ?? error));
}

/** Время создания из имени файла копии: ckom-snapshot-<ms>-<причина>.db */
function timestampFromName(name: string): number {
  const match = name.match(/-(\d{12,})/);
  return match ? Number(match[1]) : 0;
}
// 2 — таблица инспекторов (создается через CREATE TABLE IF NOT EXISTS, миграция данных не нужна)
const SCHEMA_VERSION = 2;
const SETTINGS_ROW_KEY = 'app';

/** DDL актуальной схемы. Индексы покрывают выборки по объекту, периоду и счетчику. */
const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS properties (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  address     TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meters (
  id                TEXT PRIMARY KEY NOT NULL,
  property_id       TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  name              TEXT NOT NULL,
  unit              TEXT NOT NULL,
  icon              TEXT NOT NULL,
  color             TEXT NOT NULL,
  gradient_start    TEXT NOT NULL,
  gradient_end      TEXT NOT NULL,
  current_reading   REAL NOT NULL DEFAULT 0,
  last_reading_date TEXT NOT NULL DEFAULT '',
  serial_number     TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_meters_property ON meters(property_id);

CREATE TABLE IF NOT EXISTS readings (
  id               TEXT PRIMARY KEY NOT NULL,
  meter_id         TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  meter_type       TEXT NOT NULL,
  property_id      TEXT NOT NULL,
  date             TEXT NOT NULL,
  reading          REAL NOT NULL,
  previous_reading REAL NOT NULL,
  consumption      REAL NOT NULL,
  cost             REAL NOT NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  is_replacement   INTEGER NOT NULL DEFAULT 0,
  photo            TEXT
);
CREATE INDEX IF NOT EXISTS idx_readings_property_date ON readings(property_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_readings_meter ON readings(meter_id, date DESC);

CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY NOT NULL,
  property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  meter_type    TEXT,
  month_key     TEXT NOT NULL,
  amount        REAL NOT NULL,
  date          TEXT NOT NULL,
  method        TEXT NOT NULL,
  notes         TEXT,
  receipt_photo TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_property_month ON payments(property_id, month_key);

CREATE TABLE IF NOT EXISTS tariffs (
  id              TEXT PRIMARY KEY NOT NULL,
  meter_type      TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  pricing_type    TEXT NOT NULL,
  base_rate       REAL NOT NULL,
  tier_limit      REAL,
  tier_rate       REAL,
  secondary_limit REAL,
  secondary_rate  REAL,
  currency        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspectors (
  id            TEXT PRIMARY KEY NOT NULL,
  property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  meter_type    TEXT NOT NULL,
  name          TEXT,
  organization  TEXT,
  phone         TEXT,
  telegram      TEXT,
  notes         TEXT,
  updated_at    TEXT NOT NULL,
  UNIQUE (property_id, meter_type)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  is_default: number;
}

interface MeterRow {
  id: string;
  property_id: string;
  type: MeterType;
  name: string;
  unit: string;
  icon: string;
  color: string;
  gradient_start: string;
  gradient_end: string;
  current_reading: number;
  last_reading_date: string;
  serial_number: string | null;
}

interface ReadingRow {
  id: string;
  meter_id: string;
  meter_type: MeterType;
  property_id: string;
  date: string;
  reading: number;
  previous_reading: number;
  consumption: number;
  cost: number;
  notes: string | null;
  created_at: string;
  is_replacement: number;
  photo: string | null;
}

interface PaymentRow {
  id: string;
  property_id: string;
  meter_type: MeterType | null;
  month_key: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes: string | null;
  receipt_photo: string | null;
  created_at: string;
}

interface InspectorRow {
  id: string;
  property_id: string;
  meter_type: MeterType;
  name: string | null;
  organization: string | null;
  phone: string | null;
  telegram: string | null;
  notes: string | null;
  updated_at: string;
}

interface TariffRow {
  id: string;
  meter_type: MeterType;
  title: string;
  pricing_type: 'flat' | 'tiered';
  base_rate: number;
  tier_limit: number | null;
  tier_rate: number | null;
  secondary_limit: number | null;
  secondary_rate: number | null;
  currency: string;
}

function rowToProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address || undefined,
    isDefault: row.is_default === 1,
  };
}

function rowToMeter(row: MeterRow): Meter {
  return {
    id: row.id,
    propertyId: row.property_id,
    type: row.type,
    name: row.name,
    unit: row.unit,
    icon: row.icon,
    color: row.color,
    gradient: [row.gradient_start, row.gradient_end],
    currentReading: row.current_reading,
    lastReadingDate: row.last_reading_date,
    serialNumber: row.serial_number || undefined,
  };
}

function rowToReading(row: ReadingRow): ReadingEntry {
  return {
    id: row.id,
    meterId: row.meter_id,
    meterType: row.meter_type,
    propertyId: row.property_id,
    date: row.date,
    reading: row.reading,
    previousReading: row.previous_reading,
    consumption: row.consumption,
    cost: row.cost,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    isReplacement: row.is_replacement === 1 ? true : undefined,
    photo: row.photo || undefined,
  };
}

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    propertyId: row.property_id,
    meterType: row.meter_type || undefined,
    monthKey: row.month_key,
    amount: row.amount,
    date: row.date,
    method: row.method,
    notes: row.notes || undefined,
    receiptPhoto: row.receipt_photo || undefined,
    createdAt: row.created_at,
  };
}

function rowToInspector(row: InspectorRow): Inspector {
  return {
    id: row.id,
    propertyId: row.property_id,
    meterType: row.meter_type,
    name: row.name || undefined,
    organization: row.organization || undefined,
    phone: row.phone || undefined,
    telegram: row.telegram || undefined,
    notes: row.notes || undefined,
    updatedAt: row.updated_at,
  };
}

function rowToTariff(row: TariffRow): Tariff {
  return {
    id: row.id,
    meterType: row.meter_type,
    title: row.title,
    pricingType: row.pricing_type,
    baseRate: row.base_rate,
    tierLimit: row.tier_limit ?? undefined,
    tierRate: row.tier_rate ?? undefined,
    secondaryLimit: row.secondary_limit ?? undefined,
    secondaryRate: row.secondary_rate ?? undefined,
    currency: row.currency,
  };
}

/** Вставка или замена инспектора: на пару «объект + вид ресурса» — одна запись */
const INSERT_INSPECTOR_SQL = `INSERT INTO inspectors
   (id, property_id, meter_type, name, organization, phone, telegram, notes, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
 ON CONFLICT(property_id, meter_type) DO UPDATE SET
   id = excluded.id,
   name = excluded.name,
   organization = excluded.organization,
   phone = excluded.phone,
   telegram = excluded.telegram,
   notes = excluded.notes,
   updated_at = excluded.updated_at`;

function inspectorParams(inspector: Inspector): SQLite.SQLiteBindParams {
  return [
    inspector.id,
    inspector.propertyId,
    inspector.meterType,
    inspector.name ?? null,
    inspector.organization ?? null,
    inspector.phone ?? null,
    inspector.telegram ?? null,
    inspector.notes ?? null,
    inspector.updatedAt,
  ];
}

export class SqliteRepository implements AppRepository {
  readonly backend = 'sqlite' as const;
  private db: SQLite.SQLiteDatabase | null = null;

  private get database(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('База данных не открыта: сначала вызовите init()');
    return this.db;
  }

  /** Ключ открытой базы — нужен для копий и чтения отложенных файлов */
  private key: string | null = null;

  async init(): Promise<AppData> {
    const mainExists = this.databaseFile(DATABASE_NAME).exists;
    let key: string;
    try {
      ({ key } = await getOrCreateDatabaseKey(mainExists));
    } catch (e) {
      if (String((e as Error)?.message) !== 'DATABASE_KEY_MISSING') throw e;
      // Ключа нет, а база есть: ключ потерян (например, после сброса системы).
      // Базу не удаляем — откладываем, чтобы ее можно было восстановить, если ключ найдется.
      this.setAside(DATABASE_NAME);
      key = await createReplacementKey();
    }
    this.key = key;

    await this.migratePlainDatabase(key);
    this.db = await this.openMain(key);
    await this.database.execAsync(SCHEMA_SQL);
    // Открытые копии данных прежних версий в AsyncStorage больше не храним
    await purgeLegacyAsyncStorage();

    const versionRow = await this.database.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    const currentVersion = versionRow?.user_version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      // Схема только что создана (или дополнена CREATE IF NOT EXISTS) — фиксируем версию.
      // Будущие миграции добавляются здесь по возрастанию номера.
      await this.database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }

    const isEmpty = await this.isEmpty();
    if (isEmpty) {
      // Переносим данные из AsyncStorage, если приложение обновилось с прежней версии
      const legacy = await readLegacyAsyncStorageData();
      const seed = legacy ? normalizeAppData(legacy) : cleanAppData();
      await this.replaceAll(seed);
      if (legacy) await markLegacyMigrated();
      return seed;
    }

    return this.loadAll();
  }

  /** Очередь транзакций: на одном соединении они должны идти строго по одной */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Транзакция на основном соединении.
   *
   * withExclusiveTransactionAsync из expo-sqlite открывает для транзакции новое
   * соединение, а у него нет ключа SQLCipher — запись падала с «file is not a database».
   * Поэтому BEGIN/COMMIT выполняются здесь же, а очередь не дает транзакциям
   * перемешаться.
   */
  private transaction(task: (txn: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
    const run = async () => {
      const db = this.database;
      await db.execAsync('BEGIN IMMEDIATE;');
      try {
        await task(db);
        await db.execAsync('COMMIT;');
      } catch (e) {
        await db.execAsync('ROLLBACK;').catch(() => undefined);
        throw e;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Закрывает соединение — нужно виджетам, которые открывают базу ненадолго */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }

  /** Абсолютный путь к файлу базы в каталоге SQLite приложения */
  private databaseFile(name: string): File {
    const dir: string = SQLite.defaultDatabaseDirectory;
    return new File(dir.startsWith('file://') ? dir : `file://${dir}`, name);
  }

  /**
   * Открывает файл базы ключом и проверяет, что он читается.
   * Временную блокировку («database is locked») пережидает, а «ключ не подходит»
   * сразу пробрасывает — эти случаи нельзя путать: из-за первого базу не трогают.
   */
  private async openKeyed(name: string, key: string): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    // Ждать занятую базу до 5 секунд, а не падать сразу
    await db.execAsync('PRAGMA busy_timeout = 5000;');

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
        return db;
      } catch (e) {
        lastError = e;
        if (isNotADatabase(e)) break;
        await wait(300 * (attempt + 1));
      }
    }
    await db.closeAsync().catch(() => undefined);
    throw lastError;
  }

  /**
   * Открывает основную базу. Новая пустая база создается, только если старый
   * файл точно не открывается этим ключом; сам файл при этом сохраняется.
   * Любая другая ошибка пробрасывается, и данные остаются на месте.
   */
  private async openMain(key: string): Promise<SQLite.SQLiteDatabase> {
    try {
      return await this.openKeyed(DATABASE_NAME, key);
    } catch (e) {
      if (!isNotADatabase(e)) throw e;
      console.warn('Основная база не открывается текущим ключом — файл отложен:', e);
      this.setAside(DATABASE_NAME);
      return this.openKeyed(DATABASE_NAME, key);
    }
  }

  /** Переименовывает файл базы (с журналами), чтобы освободить имя, не теряя данные */
  private setAside(name: string): void {
    const stamp = Date.now();
    for (const suffix of ['', '-wal', '-shm']) {
      const file = this.databaseFile(name + suffix);
      if (file.exists) file.rename(`${UNREADABLE_PREFIX}${stamp}.db${suffix}`);
    }
  }

  /** Абсолютный путь к каталогу баз (без file://) — нужен для ATTACH */
  private directoryPath(): string {
    const dir: string = SQLite.defaultDatabaseDirectory;
    return dir.replace(/^file:\/\//, '');
  }

  /**
   * Переносит данные из незашифрованной базы прежних версий через sqlcipher_export.
   * Существующую зашифрованную базу НИКОГДА не перезаписывает: если она уже есть,
   * открытый файл переносится в отдельную зашифрованную копию для восстановления.
   */
  private async migratePlainDatabase(key: string): Promise<void> {
    if (!this.databaseFile(PLAIN_DATABASE_NAME).exists) return;

    const targetName = this.databaseFile(DATABASE_NAME).exists
      ? `${RECOVERED_PREFIX}${Date.now()}.db`
      : DATABASE_NAME;
    const targetPath = `${this.directoryPath()}/${targetName}`;

    const plain = await SQLite.openDatabaseAsync(PLAIN_DATABASE_NAME);
    try {
      const version = await plain.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      await plain.execAsync(`ATTACH DATABASE '${targetPath}' AS secure KEY "x'${key}'";`);
      await plain.getFirstAsync("SELECT sqlcipher_export('secure')");
      await plain.execAsync(`PRAGMA secure.user_version = ${version?.user_version ?? 0};`);
      await plain.execAsync('DETACH DATABASE secure;');
    } catch (e) {
      await plain.closeAsync();
      throw e;
    }
    await plain.closeAsync();
    await SQLite.deleteDatabaseAsync(PLAIN_DATABASE_NAME);
  }

  // ---------- Копии и восстановление ----------

  /** Файлы баз в каталоге приложения с заданными префиксами */
  private listDatabaseFiles(prefixes: string[]): string[] {
    try {
      const dir = new Directory(this.databaseFile(DATABASE_NAME).uri.replace(/\/[^/]+$/, ''));
      return dir
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .map(entry => entry.name)
        .filter(name => name.endsWith('.db') && prefixes.some(prefix => name.startsWith(prefix)));
    } catch {
      return [];
    }
  }

  /**
   * Зашифрованная копия всей базы тем же ключом. Делается раз в сутки и перед
   * любой полной заменой данных (импорт, очистка, восстановление).
   */
  async createSnapshot(reason: string): Promise<void> {
    if (!this.db || !this.key) return;
    const key = this.key;
    const name = `${SNAPSHOT_PREFIX}${Date.now()}-${reason.replace(/[^a-z0-9]/gi, '')}.db`;
    const path = `${this.directoryPath()}/${name}`;

    const run = async () => {
      const db = this.database;
      await db.execAsync(`ATTACH DATABASE '${path}' AS snapshot KEY "x'${key}'";`);
      try {
        await db.getFirstAsync("SELECT sqlcipher_export('snapshot')");
        await db.execAsync(`PRAGMA snapshot.user_version = ${SCHEMA_VERSION};`);
      } finally {
        await db.execAsync('DETACH DATABASE snapshot;');
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    await result;

    // Храним только последние копии
    const snapshots = this.listDatabaseFiles([SNAPSHOT_PREFIX]).sort(
      (a, b) => timestampFromName(b) - timestampFromName(a)
    );
    for (const old of snapshots.slice(MAX_SNAPSHOTS)) {
      await SQLite.deleteDatabaseAsync(old).catch(() => undefined);
    }
  }

  /** Ежедневная копия: делается, если последней копии больше суток */
  async ensureDailySnapshot(): Promise<void> {
    const latest = Math.max(0, ...this.listDatabaseFiles([SNAPSHOT_PREFIX]).map(timestampFromName));
    if (Date.now() - latest > DAY_MS) await this.createSnapshot('daily');
  }

  /** Все файлы, из которых можно восстановить данные, с их содержимым */
  async listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
    if (!this.key) return [];
    const names = this.listDatabaseFiles([SNAPSHOT_PREFIX, UNREADABLE_PREFIX, RECOVERED_PREFIX]);
    const result: RecoveryCandidate[] = [];

    for (const name of names) {
      const kind: RecoveryCandidate['kind'] = name.startsWith(SNAPSHOT_PREFIX)
        ? 'snapshot'
        : name.startsWith(RECOVERED_PREFIX)
        ? 'recovered'
        : 'unreadable';
      const createdAt = timestampFromName(name);
      try {
        const db = await this.openKeyed(name, this.key);
        try {
          const count = async (table: string) =>
            (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))?.n ?? 0;
          const last = await db.getFirstAsync<{ d: string | null }>('SELECT max(date) AS d FROM readings');
          result.push({
            name,
            kind,
            createdAt,
            readable: true,
            properties: await count('properties'),
            readings: await count('readings'),
            payments: await count('payments'),
            lastReadingDate: last?.d ?? '',
          });
        } finally {
          await db.closeAsync();
        }
      } catch {
        result.push({
          name,
          kind,
          createdAt,
          readable: false,
          properties: 0,
          readings: 0,
          payments: 0,
          lastReadingDate: '',
        });
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Читает данные из копии или отложенной базы (без изменения основной) */
  async readRecoveryCandidate(name: string): Promise<AppData> {
    if (!this.key) throw new Error('База не открыта');
    const db = await this.openKeyed(name, this.key);
    try {
      return await this.loadAll(db);
    } finally {
      await db.closeAsync();
    }
  }

  /**
   * Только чтение для виджета: ничего не создает, не переносит и не откладывает.
   * Если базы или ключа нет, возвращает null.
   */
  static async readOnlySnapshot(): Promise<AppData | null> {
    const repository = new SqliteRepository();
    if (!repository.databaseFile(DATABASE_NAME).exists) return null;
    const key = await readDatabaseKey();
    if (!key) return null;
    const db = await repository.openKeyed(DATABASE_NAME, key);
    try {
      return await repository.loadAll(db);
    } finally {
      await db.closeAsync();
    }
  }

  private async isEmpty(): Promise<boolean> {
    const row = await this.database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM properties'
    );
    return (row?.count ?? 0) === 0;
  }

  private async loadAll(db: SQLite.SQLiteDatabase = this.database): Promise<AppData> {
    const [propertyRows, meterRows, readingRows, paymentRows, tariffRows, settingsRow, inspectorRows] =
      await Promise.all([
        db.getAllAsync<PropertyRow>('SELECT * FROM properties ORDER BY sort_order, name'),
        db.getAllAsync<MeterRow>('SELECT * FROM meters ORDER BY sort_order, name'),
        db.getAllAsync<ReadingRow>(
          'SELECT * FROM readings ORDER BY date DESC, created_at DESC'
        ),
        db.getAllAsync<PaymentRow>(
          'SELECT * FROM payments ORDER BY date DESC, created_at DESC'
        ),
        db.getAllAsync<TariffRow>('SELECT * FROM tariffs'),
        db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
          SETTINGS_ROW_KEY,
        ]),
        db.getAllAsync<InspectorRow>('SELECT * FROM inspectors'),
      ]);

    let settings: AppSettings = DEFAULT_SETTINGS;
    if (settingsRow?.value) {
      try {
        settings = JSON.parse(settingsRow.value) as AppSettings;
      } catch {
        settings = DEFAULT_SETTINGS;
      }
    }

    return normalizeAppData({
      properties: propertyRows.map(rowToProperty),
      meters: meterRows.map(rowToMeter),
      readings: readingRows.map(rowToReading),
      payments: paymentRows.map(rowToPayment),
      tariffs: tariffRows.map(rowToTariff),
      inspectors: inspectorRows.map(rowToInspector),
      settings,
    });
  }

  async replaceAll(data: AppData): Promise<void> {
    await this.transaction(async txn => {
      // Порядок важен: сначала зависимые таблицы
      // Служебные значения (база синхронизации) при полной замене данных сохраняются
      await txn.execAsync(
        'DELETE FROM readings; DELETE FROM payments; DELETE FROM inspectors; DELETE FROM meters; ' +
          "DELETE FROM properties; DELETE FROM tariffs; DELETE FROM settings WHERE key NOT LIKE 'meta:%';"
      );

      for (const [index, property] of data.properties.entries()) {
        await txn.runAsync(
          'INSERT INTO properties (id, name, address, is_default, sort_order) VALUES (?, ?, ?, ?, ?)',
          [property.id, property.name, property.address ?? null, property.isDefault ? 1 : 0, index]
        );
      }

      for (const [index, meter] of data.meters.entries()) {
        await txn.runAsync(
          `INSERT INTO meters
             (id, property_id, type, name, unit, icon, color, gradient_start, gradient_end,
              current_reading, last_reading_date, serial_number, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            meter.id,
            meter.propertyId,
            meter.type,
            meter.name,
            meter.unit,
            meter.icon,
            meter.color,
            meter.gradient[0],
            meter.gradient[1],
            meter.currentReading,
            meter.lastReadingDate,
            meter.serialNumber ?? null,
            index,
          ]
        );
      }

      for (const reading of data.readings) {
        await txn.runAsync(
          `INSERT INTO readings
             (id, meter_id, meter_type, property_id, date, reading, previous_reading,
              consumption, cost, notes, created_at, is_replacement, photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reading.id,
            reading.meterId,
            reading.meterType,
            reading.propertyId,
            reading.date,
            reading.reading,
            reading.previousReading,
            reading.consumption,
            reading.cost,
            reading.notes ?? null,
            reading.createdAt,
            reading.isReplacement ? 1 : 0,
            reading.photo ?? null,
          ]
        );
      }

      for (const payment of data.payments) {
        await txn.runAsync(
          `INSERT INTO payments
             (id, property_id, meter_type, month_key, amount, date, method, notes, receipt_photo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payment.id,
            payment.propertyId,
            payment.meterType ?? null,
            payment.monthKey,
            payment.amount,
            payment.date,
            payment.method,
            payment.notes ?? null,
            payment.receiptPhoto ?? null,
            payment.createdAt,
          ]
        );
      }

      for (const tariff of data.tariffs) {
        await txn.runAsync(
          `INSERT INTO tariffs
             (id, meter_type, title, pricing_type, base_rate, tier_limit, tier_rate,
              secondary_limit, secondary_rate, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tariff.id,
            tariff.meterType,
            tariff.title,
            tariff.pricingType,
            tariff.baseRate,
            tariff.tierLimit ?? null,
            tariff.tierRate ?? null,
            tariff.secondaryLimit ?? null,
            tariff.secondaryRate ?? null,
            tariff.currency,
          ]
        );
      }

      for (const inspector of data.inspectors) {
        await txn.runAsync(INSERT_INSPECTOR_SQL, inspectorParams(inspector));
      }

      await txn.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [
        SETTINGS_ROW_KEY,
        JSON.stringify(data.settings),
      ]);
    });
    await this.compact();
  }

  /**
   * Возвращает освободившиеся страницы файловой системе: после импорта или сброса
   * файл базы ужимается до фактического объема данных.
   */
  private async compact(): Promise<void> {
    try {
      await this.database.execAsync('VACUUM;');
    } catch (e) {
      console.warn('Не удалось сжать базу:', e);
    }
  }

  async upsertProperty(property: Property): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO properties (id, name, address, is_default, sort_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM properties))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address,
                                     is_default = excluded.is_default`,
      [property.id, property.name, property.address ?? null, property.isDefault ? 1 : 0]
    );
  }

  async deleteProperty(id: string): Promise<void> {
    // Счетчики и платежи уходят по ON DELETE CASCADE, показания — по каскаду от счетчиков
    await this.database.runAsync('DELETE FROM properties WHERE id = ?', [id]);
  }

  async upsertMeters(meters: Meter[]): Promise<void> {
    if (meters.length === 0) return;

    await this.transaction(async txn => {
      for (const meter of meters) {
        await txn.runAsync(
          `INSERT INTO meters
             (id, property_id, type, name, unit, icon, color, gradient_start, gradient_end,
              current_reading, last_reading_date, serial_number, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM meters))
           ON CONFLICT(id) DO UPDATE SET
             property_id = excluded.property_id,
             name = excluded.name,
             unit = excluded.unit,
             icon = excluded.icon,
             color = excluded.color,
             gradient_start = excluded.gradient_start,
             gradient_end = excluded.gradient_end,
             current_reading = excluded.current_reading,
             last_reading_date = excluded.last_reading_date,
             serial_number = excluded.serial_number`,
          [
            meter.id,
            meter.propertyId,
            meter.type,
            meter.name,
            meter.unit,
            meter.icon,
            meter.color,
            meter.gradient[0],
            meter.gradient[1],
            meter.currentReading,
            meter.lastReadingDate,
            meter.serialNumber ?? null,
          ]
        );
      }
    });
  }

  async deleteMeter(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM meters WHERE id = ?', [id]);
  }

  async insertReading(reading: ReadingEntry): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO readings
         (id, meter_id, meter_type, property_id, date, reading, previous_reading,
          consumption, cost, notes, created_at, is_replacement, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reading.id,
        reading.meterId,
        reading.meterType,
        reading.propertyId,
        reading.date,
        reading.reading,
        reading.previousReading,
        reading.consumption,
        reading.cost,
        reading.notes ?? null,
        reading.createdAt,
        reading.isReplacement ? 1 : 0,
        reading.photo ?? null,
      ]
    );
  }

  async updateReading(reading: ReadingEntry): Promise<void> {
    await this.database.runAsync(
      `UPDATE readings SET
         date = ?, reading = ?, previous_reading = ?, consumption = ?, cost = ?,
         notes = ?, is_replacement = ?, photo = ?
       WHERE id = ?`,
      [
        reading.date,
        reading.reading,
        reading.previousReading,
        reading.consumption,
        reading.cost,
        reading.notes ?? null,
        reading.isReplacement ? 1 : 0,
        reading.photo ?? null,
        reading.id,
      ]
    );
  }

  async deleteReading(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM readings WHERE id = ?', [id]);
  }

  async deleteReadingsByMeter(meterId: string): Promise<void> {
    await this.database.runAsync('DELETE FROM readings WHERE meter_id = ?', [meterId]);
  }

  async insertPayment(payment: Payment): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO payments
         (id, property_id, meter_type, month_key, amount, date, method, notes, receipt_photo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id,
        payment.propertyId,
        payment.meterType ?? null,
        payment.monthKey,
        payment.amount,
        payment.date,
        payment.method,
        payment.notes ?? null,
        payment.receiptPhoto ?? null,
        payment.createdAt,
      ]
    );
  }

  async updatePayment(payment: Payment): Promise<void> {
    await this.database.runAsync(
      `UPDATE payments SET
         meter_type = ?, month_key = ?, amount = ?, date = ?, method = ?,
         notes = ?, receipt_photo = ?
       WHERE id = ?`,
      [
        payment.meterType ?? null,
        payment.monthKey,
        payment.amount,
        payment.date,
        payment.method,
        payment.notes ?? null,
        payment.receiptPhoto ?? null,
        payment.id,
      ]
    );
  }

  async deletePayment(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM payments WHERE id = ?', [id]);
  }

  async upsertInspector(inspector: Inspector): Promise<void> {
    await this.database.runAsync(INSERT_INSPECTOR_SQL, inspectorParams(inspector));
  }

  async deleteInspector(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM inspectors WHERE id = ?', [id]);
  }

  async replaceTariffs(tariffs: Tariff[]): Promise<void> {
    await this.transaction(async txn => {
      for (const tariff of tariffs) {
        await txn.runAsync(
          `INSERT INTO tariffs
             (id, meter_type, title, pricing_type, base_rate, tier_limit, tier_rate,
              secondary_limit, secondary_rate, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(meter_type) DO UPDATE SET
             id = excluded.id,
             title = excluded.title,
             pricing_type = excluded.pricing_type,
             base_rate = excluded.base_rate,
             tier_limit = excluded.tier_limit,
             tier_rate = excluded.tier_rate,
             secondary_limit = excluded.secondary_limit,
             secondary_rate = excluded.secondary_rate,
             currency = excluded.currency`,
          [
            tariff.id,
            tariff.meterType,
            tariff.title,
            tariff.pricingType,
            tariff.baseRate,
            tariff.tierLimit ?? null,
            tariff.tierRate ?? null,
            tariff.secondaryLimit ?? null,
            tariff.secondaryRate ?? null,
            tariff.currency,
          ]
        );
      }
    });
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.database.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [`meta:${key}`]
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await this.database.runAsync('DELETE FROM settings WHERE key = ?', [`meta:${key}`]);
      return;
    }
    await this.database.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [`meta:${key}`, value]
    );
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SETTINGS_ROW_KEY, JSON.stringify(settings)]
    );
  }
}
