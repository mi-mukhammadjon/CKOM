import { AppData } from '../types';

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

  return {
    stats,
    data: {
      properties: mergeCollection(b.properties, local.properties, remote.properties, stats),
      meters: mergeCollection(b.meters, local.meters, remote.meters, stats),
      readings: mergeCollection(b.readings, local.readings, remote.readings, stats),
      payments: mergeCollection(b.payments, local.payments, remote.payments, stats),
      inspectors: mergeCollection(b.inspectors ?? [], local.inspectors ?? [], remote.inspectors ?? [], stats),
      tariffs: mergeCollection(b.tariffs, local.tariffs, remote.tariffs, stats),
      settings,
    },
  };
}
