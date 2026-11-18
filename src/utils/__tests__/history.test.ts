import { ReadingEntry } from '../../types';
import {
  buildHistoryBars,
  buildHistoryMonths,
  formatCompact,
  previousMonthKey,
  sortNewestFirst,
} from '../history';

const r = (id: string, meterId: string, date: string, consumption: number, cost: number, extra: Partial<ReadingEntry> = {}): ReadingEntry =>
  ({
    id,
    meterId,
    meterType: meterId === 'gas' ? 'gas' : 'electricity',
    propertyId: 'prop-1',
    date,
    createdAt: `${date}T10:00:00Z`,
    reading: 0,
    previousReading: 0,
    consumption,
    cost,
    ...extra,
  }) as ReadingEntry;

const readings = [
  r('g9', 'gas', '2026-09-05', 20, 10000),
  r('g10', 'gas', '2026-10-05', 40, 20000),
  r('e10', 'el', '2026-10-07', 200, 90000),
  r('g11', 'gas', '2026-11-05', 30, 15000),
  r('e11', 'el', '2026-11-07', 250, 112500),
];

describe('журнал по месяцам', () => {
  it('группирует от новых к старым и считает итоги месяца', () => {
    const months = buildHistoryMonths(readings, readings, 'cost');
    expect(months.map(m => m.monthKey)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(months[0].rows.map(x => x.reading.id)).toEqual(['e11', 'g11']);
    expect(months[0].totalCost).toBe(127500);
  });

  it('сравнивает расход с предыдущим показанием того же счетчика', () => {
    const [nov] = buildHistoryMonths(readings, readings, 'cost');
    const gas = nov.rows.find(x => x.reading.id === 'g11')!;
    const el = nov.rows.find(x => x.reading.id === 'e11')!;
    expect(gas.change).toBeCloseTo(-0.25);
    expect(el.change).toBeCloseTo(0.25);
  });

  it('первое показание и замена счетчика не сравниваются', () => {
    const withReplacement = [...readings, r('g12', 'gas', '2026-12-05', 5, 2500, { isReplacement: true })];
    const months = buildHistoryMonths(withReplacement, withReplacement, 'cost');
    expect(months.find(m => m.monthKey === '2026-09')!.rows[0].change).toBeNull();
    expect(months[0].rows[0].change).toBeNull();
  });

  it('сравнение с предыдущим показанием работает и при фильтре', () => {
    const onlyNov = readings.filter(x => x.date.startsWith('2026-11'));
    const [nov] = buildHistoryMonths(readings, onlyNov, 'cost');
    expect(nov.rows.find(x => x.reading.id === 'g11')!.change).toBeCloseTo(-0.25);
  });

  it('динамика месяца — к предыдущему календарному месяцу', () => {
    const months = buildHistoryMonths(readings, readings, 'cost');
    expect(months[0].change).toBeCloseTo(127500 / 110000 - 1);
    // Перед сентябрем данных нет
    expect(months[2].change).toBeNull();
    const gasOnly = readings.filter(x => x.meterId === 'gas');
    expect(buildHistoryMonths(readings, gasOnly, 'consumption')[0].change).toBeCloseTo(-0.25);
  });

  it('столбики: пропущенный месяц виден как пустой, лишних в начале нет', () => {
    const gap = [r('a', 'gas', '2026-07-05', 10, 100), r('b', 'gas', '2026-09-05', 30, 300)];
    const bars = buildHistoryBars(buildHistoryMonths(gap, gap, 'cost'), 'cost');
    expect(bars).toEqual([
      { monthKey: '2026-07', value: 100 },
      { monthKey: '2026-08', value: 0 },
      { monthKey: '2026-09', value: 300 },
    ]);
  });

  it('столбики ограничены последними месяцами', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      r(`m${i}`, 'gas', `2026-${String(i + 1).padStart(2, '0')}-05`, i + 1, (i + 1) * 100)
    );
    const bars = buildHistoryBars(buildHistoryMonths(many, many, 'consumption'), 'consumption', 6);
    expect(bars.map(b => b.monthKey)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });
});

describe('вспомогательные', () => {
  it('предыдущий месяц через границу года', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12');
    expect(previousMonthKey('2026-11')).toBe('2026-10');
  });

  it('сортировка: дата, затем время ввода', () => {
    const same = [
      r('x', 'gas', '2026-11-05', 1, 1, { createdAt: '2026-11-05T08:00:00Z' }),
      r('y', 'gas', '2026-11-05', 1, 1, { createdAt: '2026-11-05T09:00:00Z' }),
    ];
    expect(sortNewestFirst(same).map(x => x.id)).toEqual(['y', 'x']);
  });

  it('короткие подписи', () => {
    expect(formatCompact(168100)).toBe('168k');
    expect(formatCompact(1500)).toBe('1,5k');
    expect(formatCompact(2000)).toBe('2k');
    expect(formatCompact(1250000)).toBe('1,3M');
    expect(formatCompact(96)).toBe('96');
    expect(formatCompact(12.5)).toBe('12,5');
  });
});
