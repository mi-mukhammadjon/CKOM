import { MeterType, MonthBalance, MonthSummary, Payment, ReadingEntry, Tariff } from '../types';
import type { Translate, TranslationKey } from '../i18n';

export interface TariffTier {
  /** Сколько единиц попало в эту ступень */
  amount: number;
  /** Ставка за единицу внутри ступени */
  rate: number;
  /** Стоимость этой ступени */
  cost: number;
  /** Нижняя граница ступени (включительно) */
  from: number;
  /** Верхняя граница ступени, undefined = без ограничения */
  to?: number;
}

/**
 * Границы ступеней тарифа в виде пар «предел / ставка». У последней ступени предела нет.
 */
function getTierBounds(tariff: Tariff): { limit?: number; rate: number }[] {
  if (tariff.pricingType === 'flat' || !tariff.tierLimit || !tariff.tierRate) {
    return [{ rate: tariff.baseRate }];
  }

  const bounds: { limit?: number; rate: number }[] = [
    { limit: tariff.tierLimit, rate: tariff.baseRate },
  ];

  // Третья ступень применяется только если второй предел больше первого
  if (tariff.secondaryLimit && tariff.secondaryRate && tariff.secondaryLimit > tariff.tierLimit) {
    bounds.push({ limit: tariff.secondaryLimit, rate: tariff.tierRate });
    bounds.push({ rate: tariff.secondaryRate });
  } else {
    bounds.push({ rate: tariff.tierRate });
  }

  return bounds;
}

/**
 * Детальная разбивка стоимости по ступеням (для наглядности пользователю)
 */
export function getCostBreakdown(consumption: number, tariff?: Tariff): {
  tiers: TariffTier[];
  totalCost: number;
  isTiered: boolean;
} {
  if (!tariff || !(consumption > 0)) {
    return { tiers: [], totalCost: 0, isTiered: false };
  }

  const bounds = getTierBounds(tariff);
  const tiers: TariffTier[] = [];
  let covered = 0;

  for (const bound of bounds) {
    if (covered >= consumption) break;

    const upperLimit = bound.limit === undefined ? consumption : Math.min(bound.limit, consumption);
    const amount = upperLimit - covered;
    if (amount <= 0) continue;

    tiers.push({
      amount,
      rate: bound.rate,
      cost: Math.round(amount * bound.rate),
      from: covered,
      to: bound.limit,
    });
    covered = upperLimit;
  }

  return {
    tiers,
    totalCost: tiers.reduce((sum, t) => sum + t.cost, 0),
    isTiered: bounds.length > 1,
  };
}

/**
 * Расчет стоимости по тарифу (поддержка обычного и ступенчатого/социального тарифа)
 */
export function calculateReadingCost(consumption: number, tariff?: Tariff): number {
  return getCostBreakdown(consumption, tariff).totalCost;
}

/**
 * Форматирование суммы с разделителем тысяч (например "125 000 сум")
 */
export function formatCurrency(amount: number, currency: string = 'сум'): string {
  if (!isFinite(amount)) return `0 ${currency}`.trim();
  const formatted = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${currency}`.trim();
}

/**
 * Форматирование чисел расхода (например 1 250 кВт⋅ч)
 */
export function formatNumber(val: number): string {
  if (!isFinite(val)) return '0';
  const rounded = Math.round(val * 100) / 100;
  const [intPart, fracPart] = rounded.toString().split('.');
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fracPart ? `${spaced},${fracPart}` : spaced;
}

/** Ключ текущего месяца в формате 'YYYY-MM' по локальному времени */
export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Сегодняшняя дата в формате 'YYYY-MM-DD' по локальному времени */
export function getTodayDateKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Сдвигает ключ месяца на указанное число месяцев */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Последние N ключей месяцев, начиная с текущего и назад по времени */
export function getRecentMonthKeys(count: number): string[] {
  const current = getCurrentMonthKey();
  return Array.from({ length: count }, (_, index) => shiftMonthKey(current, -index));
}

/**
 * Название месяца на языке интерфейса по ключу 'YYYY-MM'
 */
export function getMonthTitle(monthKey: string, t: Translate): string {
  if (!monthKey || !monthKey.includes('-')) return monthKey;
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIndex = parseInt(monthStr, 10);
  if (monthIndex < 1 || monthIndex > 12) return monthKey;
  return `${t(`month.${monthIndex}` as TranslationKey)} ${yearStr}`;
}

/**
 * Дата 'YYYY-MM-DD' в читаемом виде на языке интерфейса ('25 сен 2026' / '25 sen 2026')
 */
export function formatDate(dateStr: string, t: Translate): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthIndex = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(day) || monthIndex < 1 || monthIndex > 12) return dateStr;
  return `${day} ${t(`monthShort.${monthIndex}` as TranslationKey)} ${parts[0]}`;
}

/** Проверка корректности даты в формате 'YYYY-MM-DD' */
export function isValidDateKey(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

/** Проверка корректности ключа месяца 'YYYY-MM' */
export function isValidMonthKey(monthKey: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
  const month = Number(monthKey.split('-')[1]);
  return month >= 1 && month <= 12;
}

const METER_UNIT_KEYS: Record<MeterType, TranslationKey> = {
  electricity: 'unit.kwh',
  cold_water: 'unit.m3',
  hot_water: 'unit.m3',
  gas: 'unit.m3',
};

/** Единица измерения ресурса на языке интерфейса */
export function getMeterUnitLabel(type: MeterType, t: Translate): string {
  return t(METER_UNIT_KEYS[type]);
}

/**
 * Группировка и подсчет итогов по месяцам
 */
export function calculateMonthSummaries(readings: ReadingEntry[], t: Translate): MonthSummary[] {
  const map: Record<string, MonthSummary> = {};

  readings.forEach(r => {
    const monthKey = r.date.slice(0, 7); // 'YYYY-MM'
    if (!map[monthKey]) {
      map[monthKey] = {
        monthKey,
        monthName: getMonthTitle(monthKey, t),
        totalCost: 0,
        readingsCount: 0,
        byMeter: {
          electricity: { consumption: 0, cost: 0, unit: getMeterUnitLabel('electricity', t) },
          cold_water: { consumption: 0, cost: 0, unit: getMeterUnitLabel('cold_water', t) },
          hot_water: { consumption: 0, cost: 0, unit: getMeterUnitLabel('hot_water', t) },
          gas: { consumption: 0, cost: 0, unit: getMeterUnitLabel('gas', t) },
        },
      };
    }

    map[monthKey].totalCost += r.cost;
    map[monthKey].readingsCount += 1;
    if (map[monthKey].byMeter[r.meterType]) {
      map[monthKey].byMeter[r.meterType].consumption += r.consumption;
      map[monthKey].byMeter[r.meterType].cost += r.cost;
    }
  });

  return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

/** Начислено по показаниям за период */
export function sumChargedForMonth(readings: ReadingEntry[], monthKey: string): number {
  return readings
    .filter(r => r.date.startsWith(monthKey))
    .reduce((sum, r) => sum + r.cost, 0);
}

/** Оплачено за период */
export function sumPaidForMonth(payments: Payment[], monthKey: string): number {
  return payments
    .filter(p => p.monthKey === monthKey)
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Состояние расчетов за один период: начислено, оплачено, остаток.
 * Остаток округляется, чтобы копеечные хвосты не считались долгом.
 */
export function calculateMonthBalance(
  monthKey: string,
  readings: ReadingEntry[],
  payments: Payment[]
): MonthBalance {
  const charged = sumChargedForMonth(readings, monthKey);
  const paid = sumPaidForMonth(payments, monthKey);
  const due = Math.round(charged - paid);

  return {
    monthKey,
    charged,
    paid,
    due,
    isSettled: charged > 0 && due <= 0,
  };
}

/**
 * Балансы по всем периодам, где есть начисления или платежи, от свежих к старым.
 */
export function calculateAllBalances(
  readings: ReadingEntry[],
  payments: Payment[]
): MonthBalance[] {
  const monthKeys = new Set<string>();
  readings.forEach(r => monthKeys.add(r.date.slice(0, 7)));
  payments.forEach(p => monthKeys.add(p.monthKey));

  return Array.from(monthKeys)
    .sort((a, b) => b.localeCompare(a))
    .map(monthKey => calculateMonthBalance(monthKey, readings, payments));
}

/** Общий непогашенный долг по всем периодам (переплаты не вычитаются из долгов других месяцев) */
export function calculateTotalDebt(readings: ReadingEntry[], payments: Payment[]): number {
  return calculateAllBalances(readings, payments)
    .filter(b => b.due > 0)
    .reduce((sum, b) => sum + b.due, 0);
}

const METER_LABEL_KEYS: Record<MeterType, TranslationKey> = {
  electricity: 'meter.electricity',
  cold_water: 'meter.cold_water',
  hot_water: 'meter.hot_water',
  gas: 'meter.gas',
};

const METER_EMOJI: Record<MeterType, string> = {
  electricity: '⚡',
  cold_water: '💧',
  hot_water: '♨️',
  gas: '🔥',
};

/**
 * Генерация текста отчета для отправки в Telegram или коммунальному инспектору.
 * Если за период есть платежи, в отчет добавляется оплаченная сумма и остаток.
 */
export function generateTelegramReport(options: {
  monthKey: string;
  propertyName: string;
  readings: ReadingEntry[];
  payments?: Payment[];
  currency: string;
  t: Translate;
}): string {
  const { monthKey, propertyName, readings, payments = [], currency, t } = options;

  const monthReadings = readings
    .filter(r => r.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalCost = monthReadings.reduce((sum, r) => sum + r.cost, 0);
  const paid = sumPaidForMonth(payments, monthKey);

  let report = `📋 *${t('report.header')}*\n`;
  report += `📅 *${t('report.period')}* ${getMonthTitle(monthKey, t)}\n`;
  report += `🏠 *${t('report.property')}* ${propertyName}\n`;
  report += `─────────────────────\n`;

  if (monthReadings.length === 0) {
    report += `${t('report.noReadings')}\n`;
  } else {
    monthReadings.forEach(r => {
      const label = `${METER_EMOJI[r.meterType]} ${t(METER_LABEL_KEYS[r.meterType])}`;
      const unit = getMeterUnitLabel(r.meterType, t);
      report += `${label}:\n`;
      report += `  • ${t('report.was')} ${formatNumber(r.previousReading)} | ${t('report.became')} ${formatNumber(r.reading)}\n`;
      report += `  • ${t('report.consumption')} *+${formatNumber(r.consumption)} ${unit}*\n`;
      report += `  • ${t('report.sum')} *${formatCurrency(r.cost, currency)}*\n`;
      if (r.isReplacement) {
        report += `  • ⚠️ ${t('report.replaced')}\n`;
      }
      report += `\n`;
    });
  }

  report += `─────────────────────\n`;
  report += `💵 *${t('report.total')} ${formatCurrency(totalCost, currency)}*\n`;

  if (paid > 0) {
    report += `✅ ${t('report.paid')} ${formatCurrency(paid, currency)}\n`;
    const due = Math.round(totalCost - paid);
    if (due > 0) {
      report += `❗ *${t('report.due')} ${formatCurrency(due, currency)}*\n`;
    }
  }

  report += `⏱ ${t('report.footer')}`;

  return report;
}
