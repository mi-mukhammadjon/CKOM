import { mergeAppData, stableStringify } from '../merge';
import { cleanAppData } from '../../services/normalize';
import { AppData, ReadingEntry } from '../../types';

function reading(id: string, value: number, notes?: string): ReadingEntry {
  return {
    id,
    meterId: 'meter-gas-prop-1',
    meterType: 'gas',
    propertyId: 'prop-1',
    date: '2026-10-01',
    reading: value,
    previousReading: 100,
    consumption: value - 100,
    cost: (value - 100) * 650,
    createdAt: `2026-10-01T10:00:0${id.length}Z`,
    notes,
  };
}

function data(readings: ReadingEntry[], extra: Partial<AppData> = {}): AppData {
  return { ...cleanAppData(), readings, ...extra };
}

describe('stableStringify', () => {
  it('не зависит от порядка ключей и пропускает undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe(stableStringify({ a: [2, { c: 3 }], b: 1 }));
  });
});

describe('mergeAppData', () => {
  const base = data([reading('a', 110), reading('b', 120)]);

  it('новые записи с обоих устройств объединяются', () => {
    const local = data([...base.readings, reading('phone', 130)]);
    const remote = data([...base.readings, reading('web', 140)]);
    const { data: merged, stats } = mergeAppData(base, local, remote);
    expect(merged.readings.map(r => r.id).sort()).toEqual(['a', 'b', 'phone', 'web']);
    expect(stats.conflicts).toBe(0);
  });

  it('удаление на другом устройстве применяется, запись не «воскресает»', () => {
    const local = base;
    const remote = data([reading('a', 110)]);
    expect(mergeAppData(base, local, remote).data.readings.map(r => r.id)).toEqual(['a']);
  });

  it('удаление здесь не отменяется старой копией с сервера', () => {
    const local = data([reading('b', 120)]);
    expect(mergeAppData(base, local, base).data.readings.map(r => r.id)).toEqual(['b']);
  });

  it('правка на одной стороне побеждает неизмененную', () => {
    const remote = data([reading('a', 110, 'поверка'), reading('b', 120)]);
    expect(mergeAppData(base, base, remote).data.readings[0].notes).toBe('поверка');
  });

  it('удалено там, изменено здесь — правку не теряем', () => {
    const local = data([reading('a', 115), reading('b', 120)]);
    const remote = data([reading('b', 120)]);
    const merged = mergeAppData(base, local, remote).data.readings;
    expect(merged.find(r => r.id === 'a')?.reading).toBe(115);
  });

  it('разные правки одной записи — конфликт, остается локальная', () => {
    const local = data([reading('a', 111), reading('b', 120)]);
    const remote = data([reading('a', 112), reading('b', 120)]);
    const { data: merged, stats } = mergeAppData(base, local, remote);
    expect(merged.readings[0].reading).toBe(111);
    expect(stats.conflicts).toBe(1);
  });

  it('без общей базы (первая синхронизация устройства) данные объединяются', () => {
    const local = data([reading('phone', 130)]);
    const remote = data([reading('web', 140)]);
    expect(mergeAppData(null, local, remote).data.readings.map(r => r.id)).toEqual(['phone', 'web']);
  });

  it('настройки сливаются по полям', () => {
    const b = cleanAppData();
    const local = { ...b, settings: { ...b.settings, theme: 'light' as const } };
    const remote = { ...b, settings: { ...b.settings, currency: '$' } };
    const merged = mergeAppData(b, local, remote).data.settings;
    expect(merged).toMatchObject({ theme: 'light', currency: '$' });
  });
});
