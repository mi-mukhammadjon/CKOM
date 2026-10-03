import { AppData, Meter, ReadingEntry, Tariff } from '../types';
import { calculateReadingCost } from './calculator';

/** Порядок записей во времени: дата, затем момент создания */
export function byOldestReading(a: ReadingEntry, b: ReadingEntry): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

/**
 * Показание «было» для новой записи счетчика: показание предыдущей по времени записи.
 * Если новая запись раньше всех — начальная точка самой ранней записи,
 * если записей нет — текущее (начальное) показание счетчика.
 */
export function previousReadingFor(
  newEntry: Pick<ReadingEntry, 'date' | 'createdAt'>,
  meterReadings: ReadingEntry[],
  baseline: number
): number {
  const sorted = [...meterReadings].sort(byOldestReading);
  const prior = sorted.filter(r => byOldestReading(r, newEntry as ReadingEntry) < 0).pop();
  if (prior) return prior.reading;
  if (sorted.length > 0) return sorted[0].previousReading;
  return baseline;
}

/**
 * Выстраивает цепочку показаний одного счетчика: «было» каждой записи равно
 * «стало» предыдущей. У самой ранней записи сохраняется ее начальная точка,
 * после замены счетчика отсчет идет с нуля.
 *
 * Возвращает только записи, у которых изменилось «было»: расход и сумма
 * пересчитываются лишь для них, чтобы старые суммы не менялись вслед за тарифом.
 */
export function recomputeReadingChain(meterReadings: ReadingEntry[], tariff?: Tariff): ReadingEntry[] {
  const sorted = [...meterReadings].sort(byOldestReading);
  const changed: ReadingEntry[] = [];

  sorted.forEach((entry, index) => {
    const previousReading = entry.isReplacement
      ? 0
      : index === 0
      ? entry.previousReading
      : sorted[index - 1].reading;

    if (previousReading !== entry.previousReading) {
      const consumption = Math.max(0, entry.reading - previousReading);
      const updated: ReadingEntry = {
        ...entry,
        previousReading,
        consumption,
        cost: calculateReadingCost(consumption, tariff),
      };
      sorted[index] = updated;
      changed.push(updated);
    }
  });

  return changed;
}

/** Сортировка: сначала самые свежие записи */
function byNewestReading(a: ReadingEntry, b: ReadingEntry): number {
  return -byOldestReading(a, b);
}

/**
 * Приводит currentReading / lastReadingDate счетчиков в соответствие с историей.
 * Счетчики без показаний сохраняют введенное вручную начальное значение.
 */
export function recomputeMeterState(meters: Meter[], readings: ReadingEntry[]): Meter[] {
  const latestByMeter = new Map<string, ReadingEntry>();
  readings.forEach(r => {
    const current = latestByMeter.get(r.meterId);
    if (!current || byNewestReading(r, current) < 0) {
      latestByMeter.set(r.meterId, r);
    }
  });

  return meters.map(m => {
    const latest = latestByMeter.get(m.id);
    if (!latest) return m;
    if (m.currentReading === latest.reading && m.lastReadingDate === latest.date) return m;
    return { ...m, currentReading: latest.reading, lastReadingDate: latest.date };
  });
}

/**
 * Проверяет всю историю: выстраивает цепочки «было → стало» по каждому счетчику
 * и приводит показания счетчиков к последним записям. Возвращает исправленные
 * данные и только те записи и счетчики, которые нужно сохранить.
 */
export function repairReadingHistory(data: AppData): {
  data: AppData;
  changedReadings: ReadingEntry[];
  changedMeters: Meter[];
} {
  const changedReadings: ReadingEntry[] = [];
  for (const meter of data.meters) {
    const tariff = data.tariffs.find(t => t.meterType === meter.type);
    changedReadings.push(
      ...recomputeReadingChain(data.readings.filter(r => r.meterId === meter.id), tariff)
    );
  }

  const byId = new Map(changedReadings.map(r => [r.id, r]));
  const readings = changedReadings.length
    ? data.readings.map(r => byId.get(r.id) ?? r)
    : data.readings;

  const meters = recomputeMeterState(data.meters, readings);
  const changedMeters = meters.filter((meter, index) => meter !== data.meters[index]);

  if (changedReadings.length === 0 && changedMeters.length === 0) {
    return { data, changedReadings, changedMeters };
  }
  return { data: { ...data, readings, meters }, changedReadings, changedMeters };
}
