export type MeterType = 'electricity' | 'cold_water' | 'hot_water' | 'gas';

/** Язык интерфейса: русский или узбекский */
export type Language = 'ru' | 'uz';

export interface Meter {
  id: string;
  type: MeterType;
  name: string;
  unit: string;
  icon: string;
  color: string;
  gradient: [string, string];
  propertyId: string;
  currentReading: number;
  lastReadingDate: string;
  serialNumber?: string;
}

export interface ReadingEntry {
  id: string;
  meterId: string;
  meterType: MeterType;
  propertyId: string;
  date: string; // YYYY-MM-DD
  reading: number;
  previousReading: number;
  consumption: number;
  cost: number;
  notes?: string;
  createdAt: string;
  /** Счетчик был заменен: расход считается от нуля, а не от предыдущего показания */
  isReplacement?: boolean;
  /** Имя файла фотографии счетчика в хранилище приложения */
  photo?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'online' | 'bank';

export interface Payment {
  id: string;
  propertyId: string;
  /** Ресурс, за который заплатили; undefined — общий платеж за весь период */
  meterType?: MeterType;
  /** Период, за который платеж, в формате YYYY-MM */
  monthKey: string;
  amount: number;
  /** Дата оплаты, YYYY-MM-DD */
  date: string;
  method: PaymentMethod;
  notes?: string;
  /** Имя файла фотографии квитанции в хранилище приложения */
  receiptPhoto?: string;
  createdAt: string;
}

export interface Tariff {
  id: string;
  meterType: MeterType;
  title: string;
  pricingType: 'flat' | 'tiered'; // flat = фиксированный за единицу, tiered = социальная норма
  baseRate: number; // базовая стоимость за 1 ед.
  tierLimit?: number; // лимит социальной нормы (например, 200 кВт⋅ч)
  tierRate?: number; // стоимость сверх нормы (например, 900 сум)
  secondaryLimit?: number; // 2-й лимит при необходимости
  secondaryRate?: number; // ставка сверх 2-го лимита
  currency: string; // "сум", "₽", "$"
}

export interface Property {
  id: string;
  name: string;
  address?: string;
  isDefault?: boolean;
}

/**
 * Контакт инспектора по одному виду ресурса на объекте.
 * Все поля, кроме привязки, необязательные.
 */
export interface Inspector {
  id: string;
  propertyId: string;
  meterType: MeterType;
  name?: string;
  organization?: string;
  phone?: string;
  /** Имя пользователя Telegram без @ */
  telegram?: string;
  notes?: string;
  updatedAt: string;
}

export interface AppSettings {
  language: Language;
  currency: string;
  theme: 'dark' | 'light';
  reminderDay: number; // день месяца для напоминания (например 25)
  reminderHour: number; // час отправки напоминания (0-23)
  notificationsEnabled: boolean;
}

export interface MonthSummary {
  monthKey: string; // YYYY-MM
  monthName: string;
  totalCost: number;
  byMeter: Record<MeterType, {
    consumption: number;
    cost: number;
    unit: string;
  }>;
  readingsCount: number;
}

/** Состояние расчетов за период: начислено, оплачено, остаток */
export interface MonthBalance {
  monthKey: string;
  charged: number;
  paid: number;
  /** Положительное значение — долг, отрицательное — переплата */
  due: number;
  isSettled: boolean;
}

export interface AppData {
  meters: Meter[];
  tariffs: Tariff[];
  properties: Property[];
  readings: ReadingEntry[];
  payments: Payment[];
  inspectors: Inspector[];
  settings: AppSettings;
}

export interface BackupFile extends AppData {
  version: string;
  timestamp: string;
}
