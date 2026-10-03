import { buildMonthGrid, toDateKey } from '../calendar';

describe('buildMonthGrid', () => {
  it('октябрь 2026 начинается с четверга', () => {
    const weeks = buildMonthGrid(2026, 10);
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks[weeks.length - 1]).toEqual([26, 27, 28, 29, 30, 31, null]);
  });

  it('учитывает високосный февраль', () => {
    const days = buildMonthGrid(2028, 2).flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });

  it('месяц, начинающийся с понедельника, не имеет пустых клеток в начале', () => {
    // 1 июня 2026 — понедельник
    expect(buildMonthGrid(2026, 6)[0][0]).toBe(1);
  });

  it('каждая неделя — 7 клеток', () => {
    expect(buildMonthGrid(2026, 3).every(week => week.length === 7)).toBe(true);
  });
});

describe('toDateKey', () => {
  it('дополняет месяц и день нулями', () => {
    expect(toDateKey(2026, 3, 5)).toBe('2026-03-05');
  });
});
