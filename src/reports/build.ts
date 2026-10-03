import { Meter, MeterType, Payment, ReadingEntry } from '../types';
import type { Translate } from '../i18n';
import {
  calculateMonthBalance,
  formatDate,
  formatNumber,
  generateTelegramReport,
  getCurrentMonthKey,
  getMeterUnitLabel,
  getMonthTitle,
  shiftMonthKey,
} from '../utils/calculator';
import { getMeterColor, getMeterTypeLabel, getPaymentMethodLabel } from '../utils/meters';
import { METER_TYPE_ORDER } from '../constants/defaults';

export type ReportType = 'summary' | 'monthly' | 'readings' | 'payments' | 'inspector';
export const REPORT_TYPES: ReportType[] = ['summary', 'monthly', 'readings', 'payments', 'inspector'];

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'quarter' | 'year' | 'last12' | 'all';
export const PERIOD_PRESETS: PeriodPreset[] = ['thisMonth', 'lastMonth', 'quarter', 'year', 'last12', 'all'];

/** Период — включительно, ключи месяцев 'YYYY-MM' */
export interface ReportPeriod {
  from: string;
  to: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportTable {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  footer?: Record<string, string>;
}

export interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
  /** Цвет значения */
  tone?: 'good' | 'bad' | 'neutral';
  /** Цвет подсказки — например, рост расходов к прошлому периоду */
  hintTone?: 'good' | 'bad' | 'neutral';
}

export interface ReportBar {
  label: string;
  value: string;
  share: number;
  color: string;
}

/** Готовый отчет: из него строятся экран, PDF, CSV и текст */
export interface Report {
  type: ReportType;
  title: string;
  propertyName: string;
  periodLabel: string;
  currency: string;
  kpis: ReportKpi[];
  bars: ReportBar[];
  tables: ReportTable[];
  /** Готовый текст для Telegram (отчет для инспектора) */
  text?: string;
  empty: boolean;
}

export interface ReportInput {
  type: ReportType;
  period: ReportPeriod;
  propertyName: string;
  meters: Meter[];
  readings: ReadingEntry[];
  payments: Payment[];
  currency: string;
  t: Translate;
}

/** Границы периода по пресету относительно текущего месяца */
export function resolvePeriod(preset: PeriodPreset, readings: ReadingEntry[]): ReportPeriod {
  const current = getCurrentMonthKey();
  switch (preset) {
    case 'thisMonth':
      return { from: current, to: current };
    case 'lastMonth': {
      const last = shiftMonthKey(current, -1);
      return { from: last, to: last };
    }
    case 'quarter':
      return { from: shiftMonthKey(current, -2), to: current };
    case 'year':
      return { from: `${current.slice(0, 4)}-01`, to: current };
    case 'last12':
      return { from: shiftMonthKey(current, -11), to: current };
    case 'all': {
      const months = readings.map(r => r.date.slice(0, 7)).sort();
      return { from: months[0] ?? current, to: current };
    }
  }
}

/** Все месяцы периода по порядку */
export function monthsOf(period: ReportPeriod): string[] {
  const months: string[] = [];
  let key = period.from;
  // Ограничение — защита от перевернутого периода
  while (key <= period.to && months.length < 600) {
    months.push(key);
    key = shiftMonthKey(key, 1);
  }
  return months;
}

export function periodLabel(period: ReportPeriod, t: Translate): string {
  return period.from === period.to
    ? getMonthTitle(period.from, t)
    : `${getMonthTitle(period.from, t)} — ${getMonthTitle(period.to, t)}`;
}

const inPeriod = (monthKey: string, period: ReportPeriod) =>
  monthKey >= period.from && monthKey <= period.to;

/** Виды ресурсов, которые есть у объекта или встречаются в записях */
function presentTypes(meters: Meter[], readings: ReadingEntry[]): MeterType[] {
  return METER_TYPE_ORDER.filter(
    type => meters.some(m => m.type === type) || readings.some(r => r.meterType === type)
  );
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------- Сводка за период ----------

function buildSummary(
  input: ReportInput,
  readings: ReadingEntry[],
  payments: Payment[]
): Pick<Report, 'kpis' | 'bars' | 'tables'> {
  const { t, period, currency } = input;
  const months = monthsOf(period);
  const charged = sum(readings, r => r.cost);
  const paid = sum(payments, p => p.amount);
  const balance = Math.round(charged - paid);

  // Такой же по длине период перед выбранным — для сравнения
  const prevPeriod = {
    from: shiftMonthKey(period.from, -months.length),
    to: shiftMonthKey(period.from, -1),
  };
  const prevCharged = sum(
    input.readings.filter(r => inPeriod(r.date.slice(0, 7), prevPeriod)),
    r => r.cost
  );
  const change = percentChange(charged, prevCharged);
  const monthsWithData = new Set(readings.map(r => r.date.slice(0, 7))).size;

  const types = presentTypes(input.meters, readings);
  const byType = types.map(type => {
    const items = readings.filter(r => r.meterType === type);
    return {
      type,
      consumption: sum(items, r => r.consumption),
      cost: sum(items, r => r.cost),
    };
  });

  return {
    kpis: [
      { label: t('reports.kpi.charged'), value: `${formatNumber(charged)} ${currency}` },
      { label: t('reports.kpi.paid'), value: `${formatNumber(paid)} ${currency}` },
      {
        label: balance > 0 ? t('reports.kpi.due') : t('reports.kpi.overpaid'),
        value: `${formatNumber(Math.abs(balance))} ${currency}`,
        tone: balance > 0 ? 'bad' : 'good',
      },
      {
        label: t('reports.kpi.avgMonth'),
        value: `${formatNumber(monthsWithData ? charged / monthsWithData : 0)} ${currency}`,
        hint:
          change === null
            ? undefined
            : t('reports.kpi.vsPrevPeriod', { value: `${change > 0 ? '+' : ''}${change}%` }),
        hintTone: change === null ? 'neutral' : change > 0 ? 'bad' : 'good',
      },
    ],
    bars: byType
      .filter(item => item.cost > 0)
      .map(item => ({
        label: getMeterTypeLabel(item.type, t),
        value: `${formatNumber(item.cost)} ${currency}`,
        share: charged > 0 ? item.cost / charged : 0,
        color: getMeterColor(item.type),
      })),
    tables: [
      {
        title: t('reports.table.byResource'),
        columns: [
          { key: 'resource', label: t('reports.col.resource') },
          { key: 'consumption', label: t('reports.col.consumption'), align: 'right' },
          { key: 'cost', label: t('reports.col.sum', { currency }), align: 'right' },
          { key: 'share', label: t('reports.col.share'), align: 'right' },
        ],
        rows: byType.map(item => ({
          resource: getMeterTypeLabel(item.type, t),
          consumption: `${formatNumber(item.consumption)} ${getMeterUnitLabel(item.type, t)}`,
          cost: formatNumber(item.cost),
          share: charged > 0 ? `${Math.round((item.cost / charged) * 100)}%` : '0%',
        })),
        footer: {
          resource: t('reports.total'),
          consumption: '',
          cost: formatNumber(charged),
          share: charged > 0 ? '100%' : '0%',
        },
      },
    ],
  };
}

// ---------- По месяцам ----------

function buildMonthly(input: ReportInput, readings: ReadingEntry[], payments: Payment[]): Pick<Report, 'kpis' | 'bars' | 'tables'> {
  const { t, period, currency } = input;
  const types = presentTypes(input.meters, readings);
  const months = monthsOf(period).reverse();

  const rows = months.map(month => {
    const monthReadings = readings.filter(r => r.date.startsWith(month));
    const balance = calculateMonthBalance(month, readings, payments);
    const row: Record<string, string> = { month: getMonthTitle(month, t) };
    types.forEach(type => {
      row[type] = formatNumber(sum(monthReadings.filter(r => r.meterType === type), r => r.cost));
    });
    row.total = formatNumber(balance.charged);
    row.paid = formatNumber(balance.paid);
    row.balance = formatNumber(balance.due);
    return row;
  });

  const footer: Record<string, string> = { month: t('reports.total') };
  types.forEach(type => {
    footer[type] = formatNumber(sum(readings.filter(r => r.meterType === type), r => r.cost));
  });
  const charged = sum(readings, r => r.cost);
  const paid = sum(payments, p => p.amount);
  footer.total = formatNumber(charged);
  footer.paid = formatNumber(paid);
  footer.balance = formatNumber(Math.round(charged - paid));

  const peak = months
    .map(month => ({ month, cost: sum(readings.filter(r => r.date.startsWith(month)), r => r.cost) }))
    .sort((a, b) => b.cost - a.cost)[0];

  return {
    kpis: [
      { label: t('reports.kpi.charged'), value: `${formatNumber(charged)} ${currency}` },
      { label: t('reports.kpi.months'), value: String(months.length) },
      {
        label: t('reports.kpi.peakMonth'),
        value: peak && peak.cost > 0 ? getMonthTitle(peak.month, t) : '—',
        hint: peak && peak.cost > 0 ? `${formatNumber(peak.cost)} ${currency}` : undefined,
      },
    ],
    bars: [],
    tables: [
      {
        columns: [
          { key: 'month', label: t('reports.col.month') },
          ...types.map(type => ({ key: type, label: getMeterTypeLabel(type, t), align: 'right' as const })),
          { key: 'total', label: t('reports.col.total', { currency }), align: 'right' },
          { key: 'paid', label: t('reports.col.paid'), align: 'right' },
          { key: 'balance', label: t('reports.col.balance'), align: 'right' },
        ],
        rows,
        footer,
      },
    ],
  };
}

// ---------- Журнал показаний ----------

function buildReadings(input: ReportInput, readings: ReadingEntry[]): Pick<Report, 'kpis' | 'bars' | 'tables'> {
  const { t, currency } = input;
  const sorted = [...readings].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );
  return {
    kpis: [
      { label: t('reports.kpi.records'), value: String(sorted.length) },
      { label: t('reports.kpi.charged'), value: `${formatNumber(sum(sorted, r => r.cost))} ${currency}` },
      {
        label: t('reports.kpi.replacements'),
        value: String(sorted.filter(r => r.isReplacement).length),
      },
    ],
    bars: [],
    tables: [
      {
        columns: [
          { key: 'date', label: t('reports.col.date') },
          { key: 'resource', label: t('reports.col.resource') },
          { key: 'was', label: t('reports.col.was'), align: 'right' },
          { key: 'became', label: t('reports.col.became'), align: 'right' },
          { key: 'consumption', label: t('reports.col.consumption'), align: 'right' },
          { key: 'cost', label: t('reports.col.sum', { currency }), align: 'right' },
          { key: 'notes', label: t('reports.col.notes') },
        ],
        rows: sorted.map(r => ({
          date: formatDate(r.date, t),
          resource: getMeterTypeLabel(r.meterType, t),
          was: formatNumber(r.previousReading),
          became: formatNumber(r.reading),
          consumption: `${formatNumber(r.consumption)} ${getMeterUnitLabel(r.meterType, t)}`,
          cost: formatNumber(r.cost),
          notes: [r.isReplacement ? t('history.replacedBadge') : '', r.notes ?? '']
            .filter(Boolean)
            .join(' · '),
        })),
        footer: {
          date: t('reports.total'),
          resource: '',
          was: '',
          became: '',
          consumption: '',
          cost: formatNumber(sum(sorted, r => r.cost)),
          notes: '',
        },
      },
    ],
  };
}

// ---------- Платежи и долг ----------

function buildPayments(input: ReportInput, readings: ReadingEntry[], payments: Payment[]): Pick<Report, 'kpis' | 'bars' | 'tables'> {
  const { t, period, currency } = input;
  const months = monthsOf(period).reverse();
  const balances = months.map(month => calculateMonthBalance(month, readings, payments));
  const charged = sum(balances, b => b.charged);
  const paid = sum(balances, b => b.paid);
  const debt = sum(balances.filter(b => b.due > 0), b => b.due);
  const overpaid = sum(balances.filter(b => b.due < 0), b => -b.due);

  const sortedPayments = [...payments].sort((a, b) => b.date.localeCompare(a.date));

  return {
    kpis: [
      { label: t('reports.kpi.charged'), value: `${formatNumber(charged)} ${currency}` },
      { label: t('reports.kpi.paid'), value: `${formatNumber(paid)} ${currency}`, tone: 'good' },
      { label: t('reports.kpi.debt'), value: `${formatNumber(debt)} ${currency}`, tone: debt > 0 ? 'bad' : 'good' },
      { label: t('reports.kpi.overpaid'), value: `${formatNumber(overpaid)} ${currency}` },
    ],
    bars: [],
    tables: [
      {
        title: t('reports.table.byMonth'),
        columns: [
          { key: 'month', label: t('reports.col.month') },
          { key: 'charged', label: t('reports.col.charged', { currency }), align: 'right' },
          { key: 'paid', label: t('reports.col.paid'), align: 'right' },
          { key: 'balance', label: t('reports.col.balance'), align: 'right' },
          { key: 'status', label: t('reports.col.status') },
        ],
        rows: balances
          .filter(b => b.charged > 0 || b.paid > 0)
          .map(b => ({
            month: getMonthTitle(b.monthKey, t),
            charged: formatNumber(b.charged),
            paid: formatNumber(b.paid),
            balance: formatNumber(b.due),
            status:
              b.due > 0
                ? t('reports.status.due')
                : b.due < 0
                ? t('reports.status.overpaid')
                : t('reports.status.settled'),
          })),
        footer: {
          month: t('reports.total'),
          charged: formatNumber(charged),
          paid: formatNumber(paid),
          balance: formatNumber(Math.round(charged - paid)),
          status: '',
        },
      },
      {
        title: t('reports.table.paymentsList'),
        columns: [
          { key: 'date', label: t('reports.col.date') },
          { key: 'period', label: t('reports.col.period') },
          { key: 'method', label: t('reports.col.method') },
          { key: 'resource', label: t('reports.col.resource') },
          { key: 'amount', label: t('reports.col.sum', { currency }), align: 'right' },
        ],
        rows: sortedPayments.map(p => ({
          date: formatDate(p.date, t),
          period: getMonthTitle(p.monthKey, t),
          method: getPaymentMethodLabel(p.method, t),
          resource: p.meterType ? getMeterTypeLabel(p.meterType, t) : t('reports.allResources'),
          amount: formatNumber(p.amount),
        })),
      },
    ],
  };
}

// ---------- Для инспектора ----------

function buildInspector(input: ReportInput, readings: ReadingEntry[]): Pick<Report, 'kpis' | 'bars' | 'tables' | 'text'> {
  const { t, period, currency } = input;
  const month = period.to;
  const monthReadings = readings.filter(r => r.date.startsWith(month));
  const text = generateTelegramReport({
    monthKey: month,
    propertyName: input.propertyName,
    readings: input.readings,
    payments: input.payments,
    currency,
    t,
  });

  return {
    text,
    kpis: [
      { label: t('reports.kpi.charged'), value: `${formatNumber(sum(monthReadings, r => r.cost))} ${currency}` },
      { label: t('reports.kpi.records'), value: String(monthReadings.length) },
    ],
    bars: [],
    tables: [
      {
        columns: [
          { key: 'resource', label: t('reports.col.resource') },
          { key: 'was', label: t('reports.col.was'), align: 'right' },
          { key: 'became', label: t('reports.col.became'), align: 'right' },
          { key: 'consumption', label: t('reports.col.consumption'), align: 'right' },
          { key: 'cost', label: t('reports.col.sum', { currency }), align: 'right' },
        ],
        rows: monthReadings.map(r => ({
          resource: getMeterTypeLabel(r.meterType, t),
          was: formatNumber(r.previousReading),
          became: formatNumber(r.reading),
          consumption: `${formatNumber(r.consumption)} ${getMeterUnitLabel(r.meterType, t)}`,
          cost: formatNumber(r.cost),
        })),
      },
    ],
  };
}

/** Собирает отчет выбранного вида за период */
export function buildReport(input: ReportInput): Report {
  const { type, period, t } = input;
  // Отчет для инспектора всегда за один месяц — последний месяц периода
  const effective = type === 'inspector' ? { from: period.to, to: period.to } : period;

  const readings = input.readings.filter(r => inPeriod(r.date.slice(0, 7), effective));
  const payments = input.payments.filter(p => inPeriod(p.monthKey, effective));

  const body =
    type === 'summary'
      ? buildSummary({ ...input, period: effective }, readings, payments)
      : type === 'monthly'
      ? buildMonthly({ ...input, period: effective }, readings, payments)
      : type === 'readings'
      ? buildReadings(input, readings)
      : type === 'payments'
      ? buildPayments({ ...input, period: effective }, readings, payments)
      : buildInspector({ ...input, period: effective }, readings);

  return {
    type,
    title: t(`reports.type.${type}` as Parameters<Translate>[0]),
    propertyName: input.propertyName,
    periodLabel: periodLabel(effective, t),
    currency: input.currency,
    empty: readings.length === 0 && payments.length === 0,
    text: undefined,
    ...body,
  };
}
