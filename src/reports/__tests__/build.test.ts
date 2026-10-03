import { buildReport, monthsOf, resolvePeriod, ReportInput } from '../build';
import { createTranslator } from '../../i18n';
import { cleanAppData } from '../../services/normalize';
import { Payment, ReadingEntry } from '../../types';

const t = createTranslator('ru');
const meters = cleanAppData().meters.filter(m => m.propertyId === 'prop-1');
const el = meters.find(m => m.type === 'electricity')!;
const water = meters.find(m => m.type === 'cold_water')!;

function reading(id: string, meterId: string, type: ReadingEntry['meterType'], date: string, consumption: number, cost: number): ReadingEntry {
  return {
    id,
    meterId,
    meterType: type,
    propertyId: 'prop-1',
    date,
    reading: 1000 + consumption,
    previousReading: 1000,
    consumption,
    cost,
    createdAt: `${date}T10:00:00Z`,
  };
}

const readings: ReadingEntry[] = [
  reading('r1', el.id, 'electricity', '2026-08-25', 160, 72000),
  reading('r2', water.id, 'cold_water', '2026-08-25', 8, 11200),
  reading('r3', el.id, 'electricity', '2026-09-25', 190, 85500),
  reading('r4', water.id, 'cold_water', '2026-09-25', 9, 12600),
];

const payments: Payment[] = [
  {
    id: 'p1',
    propertyId: 'prop-1',
    monthKey: '2026-08',
    amount: 83200,
    date: '2026-09-02',
    method: 'card',
    createdAt: '2026-09-02T10:00:00Z',
  },
];

function input(type: ReportInput['type'], from: string, to: string): ReportInput {
  return {
    type,
    period: { from, to },
    propertyName: 'Квартира',
    meters,
    readings,
    payments,
    currency: 'сум',
    t,
  };
}

describe('периоды', () => {
  it('перечисляет месяцы включительно', () => {
    expect(monthsOf({ from: '2026-11', to: '2027-02' })).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('«вся история» начинается с первого месяца с показаниями', () => {
    expect(resolvePeriod('all', readings).from).toBe('2026-08');
  });
});

describe('buildReport', () => {
  it('сводка: итоги, остаток и сравнение с прошлым периодом', () => {
    const report = buildReport(input('summary', '2026-09', '2026-09'));
    expect(report.kpis[0].value).toBe('98 100 сум');
    // Платежей за сентябрь нет — весь счет в остатке
    expect(report.kpis[2]).toMatchObject({ value: '98 100 сум', tone: 'bad' });
    // 98 100 против 83 200 в августе — рост на 18%
    expect(report.kpis[3].hint).toContain('+18%');
    expect(report.tables[0].footer?.cost).toBe('98 100');
    expect(report.bars.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1);
  });

  it('по месяцам: строка на каждый месяц, свежие сверху', () => {
    const report = buildReport(input('monthly', '2026-08', '2026-09'));
    const rows = report.tables[0].rows;
    expect(rows.map(r => r.month)).toEqual(['Сентябрь 2026', 'Август 2026']);
    expect(rows[1]).toMatchObject({ total: '83 200', paid: '83 200', balance: '0' });
  });

  it('журнал показаний только за период', () => {
    const report = buildReport(input('readings', '2026-08', '2026-08'));
    expect(report.tables[0].rows).toHaveLength(2);
  });

  it('платежи: долг считается только по неоплаченным месяцам', () => {
    const report = buildReport(input('payments', '2026-08', '2026-09'));
    expect(report.kpis.find(k => k.label === 'Долг')?.value).toBe('98 100 сум');
    expect(report.tables[1].rows).toHaveLength(1);
  });

  it('для инспектора — последний месяц периода и готовый текст', () => {
    const report = buildReport(input('inspector', '2026-08', '2026-09'));
    expect(report.periodLabel).toBe('Сентябрь 2026');
    expect(report.text).toContain('Сентябрь 2026');
    expect(report.tables[0].rows).toHaveLength(2);
  });

  it('пустой период помечается', () => {
    expect(buildReport(input('summary', '2025-01', '2025-01')).empty).toBe(true);
  });
});
