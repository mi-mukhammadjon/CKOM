import {
  AppData,
  AppSettings,
  Inspector,
  Meter,
  Payment,
  PaymentMethod,
  Property,
  ReadingEntry,
  Tariff,
} from '../types';
import {
  DEFAULT_METERS,
  DEFAULT_PROPERTIES,
  DEFAULT_SETTINGS,
  DEFAULT_TARIFFS,
  METER_PRESETS,
  METER_TYPE_ORDER,
} from '../constants/defaults';

export const BACKUP_VERSION = '3.0';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'online', 'bank'];

/** Чистое состояние: счетчики с нулями, истории нет */
export function cleanAppData(): AppData {
  return {
    meters: DEFAULT_METERS,
    tariffs: DEFAULT_TARIFFS,
    properties: DEFAULT_PROPERTIES,
    readings: [],
    payments: [],
    inspectors: [],
    settings: DEFAULT_SETTINGS,
  };
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return isFinite(parsed) ? parsed : fallback;
}

/**
 * Приводит данные любого происхождения (старый бэкап, AsyncStorage, SQLite)
 * к актуальной схеме: восстанавливает propertyId, визуальные поля счетчиков,
 * новые поля настроек и отбрасывает записи без счетчика.
 */
export function normalizeAppData(data: Partial<AppData>): AppData {
  const properties: Property[] =
    Array.isArray(data.properties) && data.properties.length > 0
      ? data.properties
      : DEFAULT_PROPERTIES;

  const defaultPropertyId = (properties.find(p => p.isDefault) || properties[0]).id;
  const knownPropertyIds = new Set(properties.map(p => p.id));

  const meters: Meter[] = (Array.isArray(data.meters) ? data.meters : DEFAULT_METERS).map(m => {
    const preset = METER_PRESETS[m.type] || METER_PRESETS.electricity;
    return {
      ...preset,
      ...m,
      // Старые бэкапы могли не знать о привязке к объекту или ссылаться на удаленный объект
      propertyId: m.propertyId && knownPropertyIds.has(m.propertyId) ? m.propertyId : defaultPropertyId,
      unit: m.unit || preset.unit,
      // Оформление всегда берется из пресета: так смена фирменной палитры
      // применяется и к счетчикам, сохраненным прежними версиями
      icon: preset.icon,
      color: preset.color,
      gradient: preset.gradient,
      currentReading: toNumber(m.currentReading),
      lastReadingDate: m.lastReadingDate || '',
    };
  });

  const meterById = new Map(meters.map(m => [m.id, m]));

  const readings: ReadingEntry[] = (Array.isArray(data.readings) ? data.readings : [])
    .filter(r => r && r.id && r.date && meterById.has(r.meterId))
    .map(r => {
      const meter = meterById.get(r.meterId)!;
      return {
        ...r,
        meterType: r.meterType || meter.type,
        // Запись всегда относится к тому же объекту, что и ее счетчик
        propertyId: meter.propertyId,
        reading: toNumber(r.reading),
        previousReading: toNumber(r.previousReading),
        consumption: toNumber(r.consumption),
        cost: toNumber(r.cost),
        createdAt: r.createdAt || new Date().toISOString(),
        isReplacement: r.isReplacement ? true : undefined,
        photo: r.photo || undefined,
      };
    });

  const payments: Payment[] = (Array.isArray(data.payments) ? data.payments : [])
    .filter(p => p && p.id && p.monthKey && knownPropertyIds.has(p.propertyId))
    .map(p => ({
      ...p,
      amount: toNumber(p.amount),
      date: p.date || `${p.monthKey}-01`,
      method: PAYMENT_METHODS.includes(p.method) ? p.method : 'cash',
      meterType: p.meterType && METER_TYPE_ORDER.includes(p.meterType) ? p.meterType : undefined,
      notes: p.notes || undefined,
      receiptPhoto: p.receiptPhoto || undefined,
      createdAt: p.createdAt || new Date().toISOString(),
    }));

  // Не больше одного инспектора на вид ресурса в объекте; пустые строки не храним
  const seenInspectors = new Set<string>();
  const inspectors: Inspector[] = (Array.isArray(data.inspectors) ? data.inspectors : [])
    .filter(i => i && i.id && knownPropertyIds.has(i.propertyId) && METER_TYPE_ORDER.includes(i.meterType))
    .filter(i => {
      const key = `${i.propertyId}:${i.meterType}`;
      if (seenInspectors.has(key)) return false;
      seenInspectors.add(key);
      return true;
    })
    .map(i => ({
      id: i.id,
      propertyId: i.propertyId,
      meterType: i.meterType,
      name: i.name?.trim() || undefined,
      organization: i.organization?.trim() || undefined,
      phone: i.phone?.trim() || undefined,
      telegram: i.telegram?.trim() || undefined,
      notes: i.notes?.trim() || undefined,
      updatedAt: i.updatedAt || new Date().toISOString(),
    }));

  const tariffs: Tariff[] = METER_TYPE_ORDER.map(type => {
    const existing = (Array.isArray(data.tariffs) ? data.tariffs : []).find(t => t.meterType === type);
    return existing || DEFAULT_TARIFFS.find(t => t.meterType === type)!;
  });

  const storedSettings: Partial<AppSettings> = data.settings || {};
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    // У данных, созданных до появления выбора языка, интерфейс был русским —
    // сохраняем это, чтобы обновление не меняло язык под пользователем
    language: storedSettings.language || (data.settings ? 'ru' : DEFAULT_SETTINGS.language),
    reminderDay: Math.min(Math.max(Math.round(toNumber(storedSettings.reminderDay, 25)), 1), 28),
    reminderHour: Math.min(Math.max(Math.round(toNumber(storedSettings.reminderHour, 10)), 0), 23),
  };

  // Валюта тарифов всегда следует за выбранной валютой расчетов
  const normalizedTariffs = tariffs.map(t => ({ ...t, currency: settings.currency }));

  return { meters, tariffs: normalizedTariffs, properties, readings, payments, inspectors, settings };
}

/** Признак того, что JSON похож на резервную копию СКОМ */
export function looksLikeBackup(parsed: unknown): parsed is Partial<AppData> {
  if (!parsed || typeof parsed !== 'object') return false;
  const candidate = parsed as Partial<AppData>;
  return Array.isArray(candidate.meters) && Array.isArray(candidate.readings);
}

/**
 * Следы прежних демо-данных: второй объект «Дача», выдуманный адрес первого объекта,
 * демо-история (фиксированные id) и демо-счетчики с заводскими номерами.
 */
const SAMPLE_PROPERTY_ADDRESSES: Record<string, string> = {
  'prop-1': 'ул. Амира Темура, 45, кв. 18',
  'prop-2': 'Ташкентская обл., Бостанлыкский р-н',
};
const SAMPLE_READING_IDS = new Set(
  ['sep', 'aug', 'jul'].flatMap(month => ['el', 'cw', 'hw', 'gas'].map(m => `read-${month}-${m}`))
);
const SAMPLE_METER_SERIALS: Record<string, string> = {
  'meter-electricity': 'SE-984321',
  'meter-cold-water': 'CW-442190',
  'meter-hot-water': 'HW-120045',
  'meter-gas': 'GS-773129',
};

/**
 * Удаляет демо-данные, оставшиеся от прежних версий. Пользовательские записи не трогает:
 * объект «Дача» удаляется, только если у него нет ни показаний, ни платежей.
 * Возвращает тот же объект, если чистить нечего.
 */
export function stripSampleData(data: AppData): AppData {
  const readings = data.readings.filter(r => !SAMPLE_READING_IDS.has(r.id));

  const usedPropertyIds = new Set([
    ...readings.map(r => r.propertyId),
    ...data.payments.map(p => p.propertyId),
  ]);
  let properties = data.properties.filter(
    p =>
      !(
        p.id === 'prop-2' &&
        p.address === SAMPLE_PROPERTY_ADDRESSES['prop-2'] &&
        !usedPropertyIds.has(p.id)
      )
  );
  if (properties.length === 0) properties = data.properties;
  properties = properties.map(p =>
    p.address && p.address === SAMPLE_PROPERTY_ADDRESSES[p.id] ? { ...p, address: undefined } : p
  );
  if (!properties.some(p => p.isDefault)) {
    properties = [{ ...properties[0], isDefault: true }, ...properties.slice(1)];
  }

  const propertyIds = new Set(properties.map(p => p.id));
  const meterIdsWithReadings = new Set(readings.map(r => r.meterId));
  const meters = data.meters
    .filter(m => propertyIds.has(m.propertyId))
    .map(m =>
      m.serialNumber &&
      SAMPLE_METER_SERIALS[m.id] === m.serialNumber &&
      !meterIdsWithReadings.has(m.id)
        ? { ...m, currentReading: 0, lastReadingDate: '', serialNumber: undefined }
        : m
    );

  const changed =
    readings.length !== data.readings.length ||
    meters.length !== data.meters.length ||
    meters.some((m, i) => m !== data.meters[i]) ||
    properties.length !== data.properties.length ||
    properties.some((p, i) => p !== data.properties[i]);

  return changed ? { ...data, properties, meters, readings } : data;
}
