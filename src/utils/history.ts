import { ReadingEntry } from '../types';

/**
 * Данные для журнала показаний: группировка по месяцам, итоги и динамика.
 * Чистые функции — экран только рисует результат.
 */

export interface HistoryRow {
  reading: ReadingEntry;
  /**
   * Изменение расхода по сравнению с предыдущим показанием того же счетчика
   * (0.25 = на 25% больше). null — сравнивать не с чем.
   */
  change: number | null;
}

export interface HistoryMonth {
  monthKey: string;
  rows: HistoryRow[];
  totalCost: number;
  totalConsumption: number;
  /** Изменение итога к предыдущему календарному месяцу; null — данных за него нет */
  change: number | null;
}

export interface HistoryBar {
  monthKey: string;
  value: number;
}

/** Новые записи — первыми: по дате, затем по времени ввода */
export function sortNewestFirst(readings: ReadingEntry[]): ReadingEntry[] {
  return [...readings].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

/** Ключ предыдущего месяца: '2026-01' → '2025-12' */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function relativeChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous <= 0) return null;
  return (current - previous) / previous;
}

/**
 * Записи по месяцам. `all` — все показания объекта (для сравнения с предыдущим
 * показанием счетчика), `visible` — то, что прошло фильтр. Месяцы сравниваются
 * по стоимости, если показаны все ресурсы, и по расходу, если выбран один.
 */
export function buildHistoryMonths(
  all: ReadingEntry[],
  visible: ReadingEntry[],
  compareBy: 'cost' | 'consumption'
): HistoryMonth[] {
  // Предыдущий расход каждого счетчика: идем по истории от старых к новым
  const previousConsumption = new Map<string, number>();
  const byMeter = new Map<string, number>();
  for (const r of [...sortNewestFirst(all)].reverse()) {
    const prev = byMeter.get(r.meterId);
    if (prev !== undefined) previousConsumption.set(r.id, prev);
    // Замена счетчика начинает новую цепочку — ее расход не сравниваем со старым
    byMeter.set(r.meterId, r.consumption);
    if (r.isReplacement) previousConsumption.delete(r.id);
  }

  const months = new Map<string, HistoryMonth>();
  for (const r of sortNewestFirst(visible)) {
    const monthKey = r.date.slice(0, 7);
    let month = months.get(monthKey);
    if (!month) {
      month = { monthKey, rows: [], totalCost: 0, totalConsumption: 0, change: null };
      months.set(monthKey, month);
    }
    month.rows.push({ reading: r, change: relativeChange(r.consumption, previousConsumption.get(r.id)) });
    month.totalCost += r.cost;
    month.totalConsumption += r.consumption;
  }

  const list = [...months.values()];
  const metric = (m: HistoryMonth) => (compareBy === 'cost' ? m.totalCost : m.totalConsumption);
  for (const month of list) {
    const prev = months.get(previousMonthKey(month.monthKey));
    month.change = prev ? relativeChange(metric(month), metric(prev)) : null;
  }
  return list;
}

/**
 * Столбики графика: последние `count` календарных месяцев, заканчивая самым
 * свежим месяцем с данными. Пропущенные месяцы показываются пустыми, чтобы
 * разрыв в истории был виден.
 */
export function buildHistoryBars(
  months: HistoryMonth[],
  compareBy: 'cost' | 'consumption',
  count = 6
): HistoryBar[] {
  if (months.length === 0) return [];
  const latest = months.reduce((max, m) => (m.monthKey > max ? m.monthKey : max), months[0].monthKey);
  const byKey = new Map(months.map(m => [m.monthKey, m]));
  const bars: HistoryBar[] = [];
  let key = latest;
  for (let i = 0; i < count; i++) {
    const month = byKey.get(key);
    bars.unshift({
      monthKey: key,
      value: month ? (compareBy === 'cost' ? month.totalCost : month.totalConsumption) : 0,
    });
    key = previousMonthKey(key);
  }
  // Не рисуем пустые месяцы раньше начала истории
  while (bars.length > 1 && bars[0].value === 0 && !byKey.has(bars[0].monthKey)) bars.shift();
  return bars;
}

/** Короткая подпись над столбиком: 168 100 → «168k», 1 250 000 → «1,3M» */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',').replace(',0', '')}k`;
  return String(Math.round(value * 10) / 10).replace('.', ',');
}
