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

  it('после слияния цепочка «было → стало» и показание счетчика пересчитываются', () => {
    const at = (id: string, value: number, date: string, prev: number): ReadingEntry => ({
      ...reading(id, value),
      date,
      createdAt: `${date}T10:00:00Z`,
      previousReading: prev,
      consumption: value - prev,
      cost: (value - prev) * 650,
    });
    const start = data([at('sep', 100, '2026-09-01', 50)]);
    // Оба устройства без связи добавили следующее показание от одного и того же «было»
    const local = data([...start.readings, at('oct', 130, '2026-10-01', 100)]);
    const remote = data([...start.readings, at('nov', 170, '2026-11-01', 100)]);
    const merged = mergeAppData(start, local, remote).data;
    const nov = merged.readings.find(r => r.id === 'nov')!;
    expect(nov.previousReading).toBe(130);
    expect(nov.consumption).toBe(40);
    const meter = merged.meters.find(m => m.id === 'meter-gas-prop-1')!;
    expect(meter.currentReading).toBe(170);
    expect(meter.lastReadingDate).toBe('2026-11-01');
  });

  it('объект удален там, а здесь в него добавлено показание — объект возвращается', () => {
    const base2 = cleanAppData();
    const dacha = { id: 'prop-2', name: 'Дача', isDefault: false };
    const dachaMeter = { ...base2.meters.find(m => m.id === 'meter-gas-prop-1')!, id: 'm-dacha', propertyId: 'prop-2' };
    const withDacha = { ...base2, properties: [...base2.properties, dacha], meters: [...base2.meters, dachaMeter] };
    const newReading = { ...reading('d1', 140), meterId: 'm-dacha', propertyId: 'prop-2' };
    const local = { ...withDacha, readings: [newReading] };
    const remote = base2; // на другом устройстве «Дачу» удалили вместе со счетчиками
    const { data: merged, stats } = mergeAppData(withDacha, local, remote);
    expect(merged.properties.map(p => p.id)).toContain('prop-2');
    expect(merged.meters.map(m => m.id)).toContain('m-dacha');
    expect(merged.readings.find(r => r.id === 'd1')?.propertyId).toBe('prop-2');
    expect(stats.conflicts).toBeGreaterThan(0);
  });

  it('объект удален там и не менялся здесь — удаление применяется', () => {
    const base2 = cleanAppData();
    const dacha = { id: 'prop-2', name: 'Дача', isDefault: false };
    const withDacha = { ...base2, properties: [...base2.properties, dacha] };
    const merged = mergeAppData(withDacha, withDacha, base2).data;
    expect(merged.properties.map(p => p.id)).not.toContain('prop-2');
  });

  it('правки, сделанные во время синхронизации, не теряются при наложении результата', () => {
    // local0 — что ушло в облако, result — что вернулось, local1 — что пользователь успел ввести
    const local0 = data([reading('a', 110)]);
    const result = data([reading('a', 110), reading('web', 140)]);
    const local1 = data([reading('a', 110), reading('typed', 125)]);
    const merged = mergeAppData(local0, local1, result).data;
    expect(merged.readings.map(r => r.id).sort()).toEqual(['a', 'typed', 'web']);
  });
});
