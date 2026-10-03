import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, AppSettings, Inspector, Meter, Payment, Property, ReadingEntry, Tariff } from '../../types';
import { cleanAppData, normalizeAppData } from '../normalize';
import { LEGACY_KEYS } from './legacy';
import { AppRepository, RecoveryCandidate } from './types';

/**
 * Резервная реализация хранилища на AsyncStorage.
 *
 * Используется в веб-сборке: `expo-sqlite` в браузере работает через WASM и
 * требует особых заголовков от сервера, поэтому для веба оставлен прежний
 * механизм. Интерфейс тот же, но запись идет целыми коллекциями — для веба,
 * как вспомогательной платформы, этого достаточно.
 */
export class AsyncStorageRepository implements AppRepository {
  readonly backend = 'async-storage' as const;
  private cache: AppData = cleanAppData();

  async init(): Promise<AppData> {
    try {
      const values = await AsyncStorage.multiGet([
        LEGACY_KEYS.METERS,
        LEGACY_KEYS.TARIFFS,
        LEGACY_KEYS.PROPERTIES,
        LEGACY_KEYS.READINGS,
        LEGACY_KEYS.PAYMENTS,
        LEGACY_KEYS.SETTINGS,
        LEGACY_KEYS.INSPECTORS,
      ]).then(pairs => pairs.map(([, value]) => value));

      const [rawMeters, rawTariffs, rawProperties, rawReadings, rawPayments, rawSettings, rawInspectors] =
        values;
      const isFirstRun = !rawMeters && !rawProperties;

      this.cache = normalizeAppData({
        meters: this.parse<Meter[] | undefined>(rawMeters, undefined),
        tariffs: this.parse<Tariff[] | undefined>(rawTariffs, undefined),
        properties: this.parse<Property[] | undefined>(rawProperties, undefined),
        readings: this.parse<ReadingEntry[]>(rawReadings, []),
        payments: this.parse<Payment[]>(rawPayments, []),
        inspectors: this.parse<Inspector[]>(rawInspectors, []),
        settings: this.parse<AppSettings | undefined>(rawSettings, undefined),
      });

      if (isFirstRun || !rawSettings || !rawTariffs || !rawPayments) {
        await this.replaceAll(this.cache);
      }

      return this.cache;
    } catch (e) {
      console.warn('Не удалось прочитать хранилище, используются значения по умолчанию:', e);
      this.cache = cleanAppData();
      return this.cache;
    }
  }

  private parse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  async replaceAll(data: AppData): Promise<void> {
    this.cache = data;
    await AsyncStorage.multiSet([
      [LEGACY_KEYS.METERS, JSON.stringify(data.meters)],
      [LEGACY_KEYS.TARIFFS, JSON.stringify(data.tariffs)],
      [LEGACY_KEYS.PROPERTIES, JSON.stringify(data.properties)],
      [LEGACY_KEYS.READINGS, JSON.stringify(data.readings)],
      [LEGACY_KEYS.PAYMENTS, JSON.stringify(data.payments)],
      [LEGACY_KEYS.SETTINGS, JSON.stringify(data.settings)],
      [LEGACY_KEYS.INSPECTORS, JSON.stringify(data.inspectors)],
    ]);
  }

  private async persist(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async upsertProperty(property: Property): Promise<void> {
    const exists = this.cache.properties.some(p => p.id === property.id);
    this.cache.properties = exists
      ? this.cache.properties.map(p => (p.id === property.id ? property : p))
      : [...this.cache.properties, property];
    await this.persist(LEGACY_KEYS.PROPERTIES, this.cache.properties);
  }

  async deleteProperty(id: string): Promise<void> {
    const meterIds = new Set(this.cache.meters.filter(m => m.propertyId === id).map(m => m.id));

    this.cache.properties = this.cache.properties.filter(p => p.id !== id);
    this.cache.meters = this.cache.meters.filter(m => m.propertyId !== id);
    this.cache.readings = this.cache.readings.filter(r => !meterIds.has(r.meterId));
    this.cache.payments = this.cache.payments.filter(p => p.propertyId !== id);
    this.cache.inspectors = this.cache.inspectors.filter(i => i.propertyId !== id);

    await AsyncStorage.multiSet([
      [LEGACY_KEYS.INSPECTORS, JSON.stringify(this.cache.inspectors)],
      [LEGACY_KEYS.PROPERTIES, JSON.stringify(this.cache.properties)],
      [LEGACY_KEYS.METERS, JSON.stringify(this.cache.meters)],
      [LEGACY_KEYS.READINGS, JSON.stringify(this.cache.readings)],
      [LEGACY_KEYS.PAYMENTS, JSON.stringify(this.cache.payments)],
    ]);
  }

  async upsertMeters(meters: Meter[]): Promise<void> {
    const incoming = new Map(meters.map(m => [m.id, m]));
    const updated = this.cache.meters.map(m => incoming.get(m.id) ?? m);
    const knownIds = new Set(this.cache.meters.map(m => m.id));
    const added = meters.filter(m => !knownIds.has(m.id));

    this.cache.meters = [...updated, ...added];
    await this.persist(LEGACY_KEYS.METERS, this.cache.meters);
  }

  async deleteMeter(id: string): Promise<void> {
    this.cache.meters = this.cache.meters.filter(m => m.id !== id);
    this.cache.readings = this.cache.readings.filter(r => r.meterId !== id);
    await AsyncStorage.multiSet([
      [LEGACY_KEYS.METERS, JSON.stringify(this.cache.meters)],
      [LEGACY_KEYS.READINGS, JSON.stringify(this.cache.readings)],
    ]);
  }

  async insertReading(reading: ReadingEntry): Promise<void> {
    this.cache.readings = [reading, ...this.cache.readings];
    await this.persist(LEGACY_KEYS.READINGS, this.cache.readings);
  }

  async updateReading(reading: ReadingEntry): Promise<void> {
    this.cache.readings = this.cache.readings.map(r => (r.id === reading.id ? reading : r));
    await this.persist(LEGACY_KEYS.READINGS, this.cache.readings);
  }

  async deleteReading(id: string): Promise<void> {
    this.cache.readings = this.cache.readings.filter(r => r.id !== id);
    await this.persist(LEGACY_KEYS.READINGS, this.cache.readings);
  }

  async deleteReadingsByMeter(meterId: string): Promise<void> {
    this.cache.readings = this.cache.readings.filter(r => r.meterId !== meterId);
    await this.persist(LEGACY_KEYS.READINGS, this.cache.readings);
  }

  async insertPayment(payment: Payment): Promise<void> {
    this.cache.payments = [payment, ...this.cache.payments];
    await this.persist(LEGACY_KEYS.PAYMENTS, this.cache.payments);
  }

  async updatePayment(payment: Payment): Promise<void> {
    this.cache.payments = this.cache.payments.map(p => (p.id === payment.id ? payment : p));
    await this.persist(LEGACY_KEYS.PAYMENTS, this.cache.payments);
  }

  async deletePayment(id: string): Promise<void> {
    this.cache.payments = this.cache.payments.filter(p => p.id !== id);
    await this.persist(LEGACY_KEYS.PAYMENTS, this.cache.payments);
  }

  async upsertInspector(inspector: Inspector): Promise<void> {
    // Один инспектор на вид ресурса в объекте: запись с той же парой заменяется
    this.cache.inspectors = [
      ...this.cache.inspectors.filter(
        i =>
          i.id !== inspector.id &&
          !(i.propertyId === inspector.propertyId && i.meterType === inspector.meterType)
      ),
      inspector,
    ];
    await this.persist(LEGACY_KEYS.INSPECTORS, this.cache.inspectors);
  }

  async deleteInspector(id: string): Promise<void> {
    this.cache.inspectors = this.cache.inspectors.filter(i => i.id !== id);
    await this.persist(LEGACY_KEYS.INSPECTORS, this.cache.inspectors);
  }

  async replaceTariffs(tariffs: Tariff[]): Promise<void> {
    this.cache.tariffs = tariffs;
    await this.persist(LEGACY_KEYS.TARIFFS, tariffs);
  }

  async getMeta(key: string): Promise<string | null> {
    return AsyncStorage.getItem(`@ckom_meta_${key}`);
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) await AsyncStorage.removeItem(`@ckom_meta_${key}`);
    else await AsyncStorage.setItem(`@ckom_meta_${key}`, value);
  }

  // В веб-версии копий базы нет: данные живут в хранилище браузера
  async createSnapshot(): Promise<void> {}
  async ensureDailySnapshot(): Promise<void> {}
  async listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
    return [];
  }
  async readRecoveryCandidate(): Promise<AppData> {
    throw new Error('Восстановление из копий недоступно в веб-версии');
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.cache.settings = settings;
    await this.persist(LEGACY_KEYS.SETTINGS, settings);
  }
}
