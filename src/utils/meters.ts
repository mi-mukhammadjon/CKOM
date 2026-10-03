import { Meter, MeterType, PaymentMethod, ReadingEntry } from '../types';
import { DICTIONARIES, type Translate, type TranslationKey } from '../i18n';
import { METER_PRESETS, METER_TYPE_ORDER } from '../constants/defaults';

const METER_LABEL_KEYS: Record<MeterType, TranslationKey> = {
  electricity: 'meter.electricity',
  cold_water: 'meter.cold_water',
  hot_water: 'meter.hot_water',
  gas: 'meter.gas',
};

const METER_SHORT_KEYS: Record<MeterType, TranslationKey> = {
  electricity: 'meter.electricity.short',
  cold_water: 'meter.cold_water.short',
  hot_water: 'meter.hot_water.short',
  gas: 'meter.gas.short',
};

const PAYMENT_METHOD_KEYS: Record<PaymentMethod, TranslationKey> = {
  cash: 'payments.method.cash',
  card: 'payments.method.card',
  online: 'payments.method.online',
  bank: 'payments.method.bank',
};

/**
 * Названия ресурса во всех языках плюс исходное значение из пресета.
 * Нужны, чтобы отличить «счетчик со стандартным именем» от переименованного вручную.
 */
const DEFAULT_NAMES_BY_TYPE: Record<MeterType, Set<string>> = METER_TYPE_ORDER.reduce(
  (acc, type) => {
    const names = new Set<string>([METER_PRESETS[type].name]);
    Object.values(DICTIONARIES).forEach(dictionary => {
      names.add(dictionary[METER_LABEL_KEYS[type]]);
    });
    acc[type] = names;
    return acc;
  },
  {} as Record<MeterType, Set<string>>
);

/** Название ресурса на языке интерфейса */
export function getMeterTypeLabel(type: MeterType, t: Translate): string {
  return t(METER_LABEL_KEYS[type]);
}

/** Короткое название ресурса для фильтров и легенд */
export function getMeterTypeShortLabel(type: MeterType, t: Translate): string {
  return t(METER_SHORT_KEYS[type]);
}

/** Название способа оплаты на языке интерфейса */
export function getPaymentMethodLabel(method: PaymentMethod, t: Translate): string {
  return t(PAYMENT_METHOD_KEYS[method]);
}

/**
 * Имя счетчика для показа пользователю.
 *
 * Счетчики со стандартным именем переводятся вместе с интерфейсом, а имена,
 * которые пользователь задал сам («Свет (кухня)»), остаются как есть.
 */
export function resolveMeterName(meter: Meter, t: Translate): string {
  const defaults = DEFAULT_NAMES_BY_TYPE[meter.type];
  if (!meter.name || (defaults && defaults.has(meter.name))) {
    return getMeterTypeLabel(meter.type, t);
  }
  return meter.name;
}

/** Иконка Ionicons для типа ресурса */
export function getMeterIcon(type: MeterType): string {
  return METER_PRESETS[type]?.icon ?? 'speedometer';
}

/** Фирменный цвет типа ресурса */
export function getMeterColor(type: MeterType): string {
  return METER_PRESETS[type]?.color ?? '#1FB8DE';
}

/**
 * Счетчику нужно начальное показание: по нему нет ни одной записи
 * и начальные цифры еще не вносились. Без них первый расход посчитался бы от нуля.
 */
export function needsInitialReading(meter: Meter, readings: ReadingEntry[]): boolean {
  return !meter.lastReadingDate && !readings.some(r => r.meterId === meter.id);
}

/** По счетчику есть записи в журнале — начальное показание уже нельзя менять */
export function hasReadingHistory(meterId: string, readings: ReadingEntry[]): boolean {
  return readings.some(r => r.meterId === meterId);
}
