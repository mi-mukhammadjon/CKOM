import { ReadingEntry, Tariff } from '../../types';
import { previousReadingFor, recomputeReadingChain, repairReadingHistory } from '../readings';
import { cleanAppData } from '../../services/normalize';

const tariff: Tariff = {
  id: 't-gas',
  meterType: 'gas',
  title: 'Газ',
  pricingType: 'flat',
  baseRate: 650,
  currency: 'сум',
};

function entry(id: string, date: string, reading: number, previousReading: number, extra: Partial<ReadingEntry> = {}): ReadingEntry {
  return {
    id,
    meterId: 'gas-1',
    meterType: 'gas',
    propertyId: 'prop-1',
    date,
    reading,
    previousReading,
    consumption: Math.max(0, reading - previousReading),
    cost: Math.max(0, reading - previousReading) * 650,
    createdAt: `${date}T10:00:00Z`,
    ...extra,
  };
}

describe('previousReadingFor', () => {
  // Случай из жалобы: обе записи считались от начального 1478,13
  const first = entry('a', '2026-10-03', 1501.09, 1478.13, { createdAt: '2026-10-03T10:00:00Z' });

  it('новая запись считается от предыдущей записи, а не от начального показания', () => {
    expect(previousReadingFor({ date: '2026-10-03', createdAt: '2026-10-03T12:00:00Z' }, [first], 1478.13)).toBe(1501.09);
  });

  it('первая запись считается от начального показания счетчика', () => {
    expect(previousReadingFor({ date: '2026-10-03', createdAt: 'x' }, [], 1478.13)).toBe(1478.13);
  });

  it('запись задним числом раньше всех берет начальную точку самой ранней записи', () => {
    expect(previousReadingFor({ date: '2026-09-01', createdAt: 'x' }, [first], 0)).toBe(1478.13);
  });
});

describe('recomputeReadingChain', () => {
  it('чинит цепочку, где все записи считались от начального показания', () => {
    const broken = [
      entry('a', '2026-09-01', 1501.09, 1478.13),
      entry('b', '2026-10-01', 1530, 1478.13),
    ];
    const changed = recomputeReadingChain(broken, tariff);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ id: 'b', previousReading: 1501.09 });
    expect(changed[0].consumption).toBeCloseTo(28.91);
    expect(changed[0].cost).toBe(Math.round(28.91 * 650));
  });

  it('запись, вставленная в середину, становится «было» для следующей', () => {
    const readings = [
      entry('a', '2026-08-01', 100, 50),
      entry('c', '2026-10-01', 160, 100),
      entry('b', '2026-09-01', 130, 100),
    ];
    const changed = recomputeReadingChain(readings, tariff);
    expect(changed.map(r => [r.id, r.previousReading])).toEqual([['c', 130]]);
  });

  it('после замены счетчика отсчет идет с нуля', () => {
    const readings = [entry('a', '2026-08-01', 900, 800), entry('b', '2026-09-01', 15, 900, { isReplacement: true })];
    const [changed] = recomputeReadingChain(readings, tariff);
    expect(changed).toMatchObject({ id: 'b', previousReading: 0, consumption: 15 });
  });

  it('правильную цепочку не трогает', () => {
    const readings = [entry('a', '2026-08-01', 100, 50), entry('b', '2026-09-01', 130, 100)];
    expect(recomputeReadingChain(readings, tariff)).toEqual([]);
  });
});

describe('repairReadingHistory', () => {
  it('чинит случай из жалобы: счетчик застрял на начальном показании', () => {
    const base = cleanAppData();
    const gas = base.meters.find(m => m.type === 'gas')!;
    const data = {
      ...base,
      // В базе осталось начальное показание: обновление счетчика не записалось
      meters: base.meters.map(m =>
        m.id === gas.id ? { ...m, currentReading: 1478.13, lastReadingDate: '2026-09-01' } : m
      ),
      readings: [
        { ...entry('a', '2026-10-03', 1501.09, 1478.13), meterId: gas.id, createdAt: '2026-10-03T10:00:00Z' },
        { ...entry('b', '2026-10-03', 1530, 1478.13), meterId: gas.id, createdAt: '2026-10-03T12:00:00Z' },
      ],
    };

    const { data: fixed, changedReadings, changedMeters } = repairReadingHistory(data);

    expect(changedReadings.map(r => [r.id, r.previousReading])).toEqual([['b', 1501.09]]);
    expect(changedMeters).toHaveLength(1);
    expect(fixed.meters.find(m => m.id === gas.id)).toMatchObject({
      currentReading: 1530,
      lastReadingDate: '2026-10-03',
    });
  });

  it('исправные данные возвращает без изменений', () => {
    const data = cleanAppData();
    expect(repairReadingHistory(data).data).toBe(data);
  });
});
