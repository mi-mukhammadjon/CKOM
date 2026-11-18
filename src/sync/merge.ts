import { AppData } from '../types';
import { repairReadingHistory } from '../utils/readings';

/** Строка JSON с упорядоченными ключами — чтобы сравнение не зависело от порядка полей */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

export interface MergeStats {
  /** Записи, измененные на обоих устройствах по-разному */
  conflicts: number;
}

/**
 * Трехстороннее слияние одной коллекции по id относительно общей базы
 * (состояния после прошлой синхронизации):
 *  - изменилось только на одной стороне — берем эту сторону (включая удаление);
 *  - изменилось на обеих одинаково — берем любую;
 *  - изменилось на обеих по-разному — берем локальную версию;
 *  - удалено на одной стороне и изменено на другой — оставляем измененную,
 *    чтобы не потерять правку.
 */
function mergeCollection<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
  stats: MergeStats
): T[] {
  const baseMap = new Map(base.map(item => [item.id, item]));
  const localMap = new Map(local.map(item => [item.id, item]));
  const remoteMap = new Map(remote.map(item => [item.id, item]));

  // Порядок: как на этом устройстве, затем новые записи с другого
  const ids = [...local.map(i => i.id), ...remote.map(i => i.id).filter(id => !localMap.has(id))];
  const result: T[] = [];

  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);

    let chosen: T | undefined;
    if (same(l, r)) chosen = l;
    else if (same(l, b)) chosen = r;
    else if (same(r, b)) chosen = l;
    else {
      stats.conflicts++;
      chosen = l ?? r;
    }
    if (chosen) result.push(chosen);
  }
  return result;
}

/** Пустая база: первое слияние на устройстве объединяет обе стороны */
export const EMPTY_BASE: Pick<AppData, 'properties' | 'meters' | 'readings' | 'payments' | 'inspectors' | 'tariffs'> = {
  properties: [],
  meters: [],
  readings: [],
  payments: [],
  inspectors: [],
  tariffs: [],
};

/**
 * Слияние всех данных двух устройств. Настройки сливаются по полям:
 * берется сторона, которая изменила поле с прошлой синхронизации.
 */
export function mergeAppData(
  base: AppData | null,
  local: AppData,
  remote: AppData
): { data: AppData; stats: MergeStats } {
  const stats: MergeStats = { conflicts: 0 };
  const b = base ?? ({ ...EMPTY_BASE, settings: local.settings } as AppData);

  const settings = { ...remote.settings };
  for (const key of Object.keys(local.settings) as (keyof AppData['settings'])[]) {
    const changedLocally = !same(local.settings[key], b.settings?.[key]);
    if (changedLocally || remote.settings[key] === undefined) {
      (settings as Record<string, unknown>)[key] = local.settings[key];
    }
  }

  const merged: AppData = {
    properties: mergeCollection(b.properties, local.properties, remote.properties, stats),
    meters: mergeCollection(b.meters, local.meters, remote.meters, stats),
    readings: mergeCollection(b.readings, local.readings, remote.readings, stats),
    payments: mergeCollection(b.payments, local.payments, remote.payments, stats),
    inspectors: mergeCollection(b.inspectors ?? [], local.inspectors ?? [], remote.inspectors ?? [], stats),
    tariffs: mergeCollection(b.tariffs, local.tariffs, remote.tariffs, stats),
    settings,
  };

  const restored = restoreParents(merged, [local, remote, b], stats);
  // Записи с двух устройств могли встать в одну цепочку счетчика: «было», расход,
  // сумма и текущее показание счетчика пересчитываются по объединенной истории
  return { stats, data: repairReadingHistory(restored).data };
}

/**
 * Удалено на одном устройстве, а на другом в него добавили или изменили записи:
 * объект или счетчик возвращается, чтобы записи не «переехали» в чужой объект
 * и не пропали. Неизмененные дочерние записи удаляются вместе с родителем
 * еще на этапе слияния, поэтому сюда попадают только реальные правки.
 */
function restoreParents(data: AppData, sources: AppData[], stats: MergeStats): AppData {
  const findIn = <T extends { id: string }>(pick: (d: AppData) => T[] | undefined, id: string) => {
    for (const source of sources) {
      const found = pick(source)?.find(item => item.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const meters = [...data.meters];
  const meterIds = new Set(meters.map(m => m.id));
  for (const r of data.readings) {
    if (meterIds.has(r.meterId)) continue;
    const meter = findIn(d => d.meters, r.meterId);
    if (meter) {
      meters.push(meter);
      meterIds.add(meter.id);
      stats.conflicts++;
    }
  }

  const properties = [...data.properties];
  const propertyIds = new Set(properties.map(p => p.id));
  const needed = [
    ...meters.map(m => m.propertyId),
    ...data.payments.map(p => p.propertyId),
    ...(data.inspectors ?? []).map(i => i.propertyId),
  ];
  for (const id of needed) {
    if (!id || propertyIds.has(id)) continue;
    const property = findIn(d => d.properties, id);
    if (property) {
      properties.push({ ...property, isDefault: false });
      propertyIds.add(property.id);
      stats.conflicts++;
    }
  }

  if (meters.length === data.meters.length && properties.length === data.properties.length) return data;
  return { ...data, meters, properties };
}
