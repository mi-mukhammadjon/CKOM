import { Meter, MeterType, Tariff, Property, AppSettings, PaymentMethod } from '../types';

/**
 * Шаблоны счетчиков: внешний вид и единицы для каждого типа ресурса.
 * Используются и для стандартных счетчиков, и при создании нового объекта учета.
 */
export const METER_PRESETS: Record<MeterType, Omit<Meter, 'id' | 'propertyId' | 'currentReading' | 'lastReadingDate' | 'serialNumber'>> = {
  electricity: {
    type: 'electricity',
    name: 'Электричество',
    unit: 'кВт⋅ч',
    icon: 'flash',
    color: '#F5B700', // янтарный, как молния в логотипе
    gradient: ['#FFC83D', '#E0A100'],
  },
  cold_water: {
    type: 'cold_water',
    name: 'Холодная вода',
    unit: 'м³',
    icon: 'water',
    color: '#1FB8DE', // бирюзовый, как капля в логотипе
    gradient: ['#2ED3F0', '#0AA0C8'],
  },
  hot_water: {
    type: 'hot_water',
    name: 'Горячая вода',
    unit: 'м³',
    icon: 'water',
    color: '#FF5C72', // коралловый
    gradient: ['#FF6B7A', '#E6465A'],
  },
  gas: {
    type: 'gas',
    name: 'Природный газ',
    unit: 'м³',
    icon: 'flame',
    color: '#FF8A3D', // оранжевый, как пламя в логотипе
    gradient: ['#FF8A3D', '#F06E1E'],
  },
};

export const METER_TYPE_ORDER: MeterType[] = ['electricity', 'cold_water', 'hot_water', 'gas'];

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['cash', 'card', 'online', 'bank'];

/** Иконки способов оплаты (Ionicons) */
export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: 'cash-outline',
  card: 'card-outline',
  online: 'phone-portrait-outline',
  bank: 'business-outline',
};

/** Создает счетчик указанного типа для объекта с нулевыми показаниями */
export function createMeterForProperty(
  propertyId: string,
  type: MeterType,
  overrides: Partial<Pick<Meter, 'name' | 'currentReading' | 'lastReadingDate' | 'serialNumber'>> = {}
): Meter {
  return {
    ...METER_PRESETS[type],
    id: `meter_${type}_${propertyId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    propertyId,
    currentReading: 0,
    lastReadingDate: '',
    ...overrides,
  };
}

/** Полный комплект из 4 счетчиков для нового объекта учета */
export function createDefaultMetersForProperty(propertyId: string): Meter[] {
  return METER_TYPE_ORDER.map(type => createMeterForProperty(propertyId, type));
}

export const DEFAULT_PROPERTIES: Property[] = [
  {
    id: 'prop-1',
    name: 'Uy',
    isDefault: true,
  },
];

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    id: 'tariff-electricity',
    meterType: 'electricity',
    title: 'Электричество',
    pricingType: 'tiered',
    baseRate: 450, // 450 сум за кВт⋅ч до нормы
    tierLimit: 200, // соц. норма 200 кВт⋅ч
    tierRate: 900, // 900 сум свыше 200 кВт⋅ч
    currency: 'сум',
  },
  {
    id: 'tariff-cold-water',
    meterType: 'cold_water',
    title: 'Холодная вода',
    pricingType: 'flat',
    baseRate: 1400, // 1400 сум за м³
    currency: 'сум',
  },
  {
    id: 'tariff-hot-water',
    meterType: 'hot_water',
    title: 'Горячая вода',
    pricingType: 'flat',
    baseRate: 5200, // 5200 сум за м³
    currency: 'сум',
  },
  {
    id: 'tariff-gas',
    meterType: 'gas',
    title: 'Природный газ',
    pricingType: 'tiered',
    baseRate: 650, // 650 сум до 500 м³
    tierLimit: 500, // норма
    tierRate: 1500, // свыше нормы
    currency: 'сум',
  }
];

/**
 * Стандартные счетчики при первом запуске: 4 счетчика на объект,
 * с нулевыми показаниями — пользователь вводит свои цифры с прибора.
 */
export const DEFAULT_METERS: Meter[] = DEFAULT_PROPERTIES.flatMap(prop =>
  METER_TYPE_ORDER.map<Meter>(type => ({
    ...METER_PRESETS[type],
    id: `meter-${type}-${prop.id}`,
    propertyId: prop.id,
    currentReading: 0,
    lastReadingDate: '',
  }))
);

export const DEFAULT_SETTINGS: AppSettings = {
  // По умолчанию узбекский: приложение рассчитано на Узбекистан.
  // Для данных, созданных до появления выбора языка, миграция оставляет русский.
  language: 'uz',
  currency: 'сум',
  theme: 'dark',
  reminderDay: 25,
  reminderHour: 10,
  notificationsEnabled: true,
};
