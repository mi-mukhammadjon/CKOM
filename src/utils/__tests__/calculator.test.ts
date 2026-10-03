import { Payment, ReadingEntry, Tariff } from '../../types';
import { createTranslator } from '../../i18n';
import {
  calculateAllBalances,
  calculateMonthBalance,
  calculateMonthSummaries,
  calculateReadingCost,
  calculateTotalDebt,
  formatCurrency,
  formatDate,
  formatNumber,
  generateTelegramReport,
  getCostBreakdown,
  getCurrentMonthKey,
  getMeterUnitLabel,
  getMonthTitle,
  getRecentMonthKeys,
  getTodayDateKey,
  isValidDateKey,
  isValidMonthKey,
  shiftMonthKey,
  sumChargedForMonth,
  sumPaidForMonth,
} from '../calculator';

const ru = createTranslator('ru');
const uz = createTranslator('uz');

const flatTariff: Tariff = {
  id: 'tariff-cold-water',
  meterType: 'cold_water',
  title: 'Холодная вода',
  pricingType: 'flat',
  baseRate: 1400,
  currency: 'сум',
};

const twoTierTariff: Tariff = {
  id: 'tariff-electricity',
  meterType: 'electricity',
  title: 'Электричество',
  pricingType: 'tiered',
  baseRate: 450,
  tierLimit: 200,
  tierRate: 900,
  currency: 'сум',
};

const threeTierTariff: Tariff = {
  ...twoTierTariff,
  secondaryLimit: 300,
  secondaryRate: 1800,
};

function makeReading(partial: Partial<ReadingEntry>): ReadingEntry {
  return {
    id: 'r1',
    meterId: 'm1',
    meterType: 'electricity',
    propertyId: 'prop-1',
    date: '2026-09-25',
    reading: 100,
    previousReading: 90,
    consumption: 10,
    cost: 4500,
    createdAt: '2026-09-25T10:00:00Z',
    ...partial,
  };
}

function makePayment(partial: Partial<Payment>): Payment {
  return {
    id: 'p1',
    propertyId: 'prop-1',
    monthKey: '2026-09',
    amount: 1000,
    date: '2026-09-26',
    method: 'cash',
    createdAt: '2026-09-26T10:00:00Z',
    ...partial,
  };
}

describe('calculateReadingCost', () => {
  it('умножает расход на ставку для единого тарифа', () => {
    expect(calculateReadingCost(12, flatTariff)).toBe(12 * 1400);
  });

  it('возвращает 0 для нулевого, отрицательного расхода и отсутствующего тарифа', () => {
    expect(calculateReadingCost(0, flatTariff)).toBe(0);
    expect(calculateReadingCost(-5, flatTariff)).toBe(0);
    expect(calculateReadingCost(10, undefined)).toBe(0);
    expect(calculateReadingCost(NaN, flatTariff)).toBe(0);
  });

  it('считает по базовой ставке, пока расход в пределах нормы', () => {
    expect(calculateReadingCost(170, twoTierTariff)).toBe(170 * 450);
  });

  it('не выходит за норму на самой границе лимита', () => {
    expect(calculateReadingCost(200, twoTierTariff)).toBe(200 * 450);
  });

  it('применяет повышенную ставку только к превышению', () => {
    expect(calculateReadingCost(220, twoTierTariff)).toBe(200 * 450 + 20 * 900);
  });

  it('поддерживает третью ступень', () => {
    expect(calculateReadingCost(350, threeTierTariff)).toBe(200 * 450 + 100 * 900 + 50 * 1800);
  });

  it('не задействует третью ступень, пока не превышен второй лимит', () => {
    expect(calculateReadingCost(250, threeTierTariff)).toBe(200 * 450 + 50 * 900);
    expect(calculateReadingCost(300, threeTierTariff)).toBe(200 * 450 + 100 * 900);
  });

  it('игнорирует второй лимит, если он не больше первого', () => {
    const broken: Tariff = { ...threeTierTariff, secondaryLimit: 150 };
    expect(calculateReadingCost(250, broken)).toBe(200 * 450 + 50 * 900);
  });

  it('считает ступенчатый тариф как единый, если ступень заполнена не полностью', () => {
    const halfFilled: Tariff = { ...twoTierTariff, tierRate: undefined };
    expect(calculateReadingCost(220, halfFilled)).toBe(220 * 450);
  });
});

describe('getCostBreakdown', () => {
  it('отдает одну ступень для единого тарифа', () => {
    const result = getCostBreakdown(12, flatTariff);
    expect(result.isTiered).toBe(false);
    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0]).toMatchObject({ amount: 12, rate: 1400, cost: 16800, from: 0 });
  });

  it('разбивает расход на три ступени с корректными границами', () => {
    const result = getCostBreakdown(350, threeTierTariff);
    expect(result.isTiered).toBe(true);
    expect(result.tiers).toEqual([
      { amount: 200, rate: 450, cost: 90000, from: 0, to: 200 },
      { amount: 100, rate: 900, cost: 90000, from: 200, to: 300 },
      { amount: 50, rate: 1800, cost: 90000, from: 300, to: undefined },
    ]);
  });

  it('сумма ступеней всегда равна итоговой стоимости', () => {
    const result = getCostBreakdown(287, threeTierTariff);
    const sum = result.tiers.reduce((acc, tier) => acc + tier.cost, 0);
    expect(sum).toBe(result.totalCost);
    expect(result.totalCost).toBe(calculateReadingCost(287, threeTierTariff));
  });

  it('не создает пустых ступеней на границе лимита', () => {
    expect(getCostBreakdown(200, twoTierTariff).tiers).toHaveLength(1);
  });

  it('помечает тариф ступенчатым даже когда расход не вышел из нормы', () => {
    const result = getCostBreakdown(50, twoTierTariff);
    expect(result.isTiered).toBe(true);
    expect(result.tiers).toHaveLength(1);
  });

  it('возвращает пустую разбивку без тарифа', () => {
    expect(getCostBreakdown(100, undefined)).toEqual({ tiers: [], totalCost: 0, isTiered: false });
  });
});

describe('форматирование', () => {
  it('разделяет тысячи неразрывным пробелом и добавляет валюту', () => {
    expect(formatCurrency(143700, 'сум')).toBe('143 700 сум');
    expect(formatCurrency(0, '$')).toBe('0 $');
  });

  it('не оставляет висящего пробела при пустой валюте', () => {
    expect(formatCurrency(1000, '')).toBe('1 000');
  });

  it('округляет дробные суммы', () => {
    expect(formatCurrency(1499.6, 'сум')).toBe('1 500 сум');
  });

  it('устойчив к NaN и Infinity', () => {
    expect(formatCurrency(NaN, 'сум')).toBe('0 сум');
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('0');
  });

  it('форматирует числа расхода, сохраняя дробную часть', () => {
    expect(formatNumber(14980)).toBe('14 980');
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatNumber(1234567)).toBe('1 234 567');
  });

  it('переводит единицы измерения вместе с языком', () => {
    expect(getMeterUnitLabel('electricity', ru)).toBe('кВт⋅ч');
    expect(getMeterUnitLabel('electricity', uz)).toBe('kVt⋅s');
    expect(getMeterUnitLabel('gas', ru)).toBe('м³');
    expect(getMeterUnitLabel('gas', uz)).toBe('м³'.replace('м³', 'm³'));
  });
});

describe('работа с датами', () => {
  it('форматирует дату на выбранном языке', () => {
    expect(formatDate('2026-09-25', ru)).toBe('25 сен 2026');
    expect(formatDate('2026-09-25', uz)).toBe('25 sen 2026');
    expect(formatDate('2026-01-01', ru)).toBe('1 янв 2026');
  });

  it('возвращает исходную строку, если дату разобрать нельзя', () => {
    expect(formatDate('', ru)).toBe('');
    expect(formatDate('2026-09', ru)).toBe('2026-09');
    expect(formatDate('2026-99-01', ru)).toBe('2026-99-01');
  });

  it('даёт название месяца на выбранном языке', () => {
    expect(getMonthTitle('2026-09', ru)).toBe('Сентябрь 2026');
    expect(getMonthTitle('2026-09', uz)).toBe('Sentabr 2026');
    expect(getMonthTitle('broken', ru)).toBe('broken');
    expect(getMonthTitle('2026-13', ru)).toBe('2026-13');
  });

  it('отличает корректные даты от некорректных', () => {
    expect(isValidDateKey('2026-10-25')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true); // високосный год
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-00-10')).toBe(false);
    expect(isValidDateKey('2026-10-00')).toBe(false);
    expect(isValidDateKey('26-10-5')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });

  it('проверяет ключи месяцев', () => {
    expect(isValidMonthKey('2026-10')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-1')).toBe(false);
  });

  it('сдвигает ключ месяца через границу года', () => {
    expect(shiftMonthKey('2026-03', -1)).toBe('2026-02');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-06', 0)).toBe('2026-06');
    expect(shiftMonthKey('broken', -1)).toBe('broken');
  });

  it('отдает последние месяцы по убыванию, начиная с текущего', () => {
    const keys = getRecentMonthKeys(6);
    expect(keys).toHaveLength(6);
    expect(keys[0]).toBe(getCurrentMonthKey());
    expect([...keys].sort((a, b) => b.localeCompare(a))).toEqual(keys);
    expect(new Set(keys).size).toBe(6);
  });

  it('считает сегодняшнюю дату и месяц по локальному времени', () => {
    const now = new Date();
    const expectedDay = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    expect(getTodayDateKey()).toBe(expectedDay);
    expect(getCurrentMonthKey()).toBe(expectedDay.slice(0, 7));
    expect(isValidDateKey(getTodayDateKey())).toBe(true);
  });
});

describe('calculateMonthSummaries', () => {
  const readings: ReadingEntry[] = [
    makeReading({ id: 'a', date: '2026-09-25', meterType: 'electricity', consumption: 170, cost: 76500 }),
    makeReading({ id: 'b', date: '2026-09-25', meterType: 'gas', consumption: 30, cost: 19500 }),
    makeReading({ id: 'c', date: '2026-08-25', meterType: 'electricity', consumption: 220, cost: 108000 }),
  ];

  it('группирует записи по месяцам от свежих к старым', () => {
    expect(calculateMonthSummaries(readings, ru).map(s => s.monthKey)).toEqual([
      '2026-09',
      '2026-08',
    ]);
  });

  it('суммирует стоимость и расход по типам ресурсов', () => {
    const [september] = calculateMonthSummaries(readings, ru);
    expect(september.totalCost).toBe(76500 + 19500);
    expect(september.readingsCount).toBe(2);
    expect(september.byMeter.electricity).toMatchObject({ consumption: 170, cost: 76500 });
    expect(september.byMeter.gas).toMatchObject({ consumption: 30, cost: 19500 });
    expect(september.byMeter.hot_water).toMatchObject({ consumption: 0, cost: 0 });
  });

  it('локализует название месяца и единицы', () => {
    const [september] = calculateMonthSummaries(readings, uz);
    expect(september.monthName).toBe('Sentabr 2026');
    expect(september.byMeter.electricity.unit).toBe('kVt⋅s');
  });

  it('возвращает пустой список без записей', () => {
    expect(calculateMonthSummaries([], ru)).toEqual([]);
  });
});

describe('балансы и платежи', () => {
  const readings: ReadingEntry[] = [
    makeReading({ id: 'sep', date: '2026-09-25', cost: 100000 }),
    makeReading({ id: 'aug', date: '2026-08-25', cost: 80000 }),
  ];

  it('суммирует начисления и платежи только за свой период', () => {
    const payments = [
      makePayment({ id: 'p-sep', monthKey: '2026-09', amount: 60000 }),
      makePayment({ id: 'p-aug', monthKey: '2026-08', amount: 80000 }),
    ];

    expect(sumChargedForMonth(readings, '2026-09')).toBe(100000);
    expect(sumPaidForMonth(payments, '2026-09')).toBe(60000);
  });

  it('считает остаток долга за период', () => {
    const balance = calculateMonthBalance(
      '2026-09',
      readings,
      [makePayment({ monthKey: '2026-09', amount: 60000 })]
    );

    expect(balance).toMatchObject({
      monthKey: '2026-09',
      charged: 100000,
      paid: 60000,
      due: 40000,
      isSettled: false,
    });
  });

  it('помечает период оплаченным при точной и избыточной оплате', () => {
    const exact = calculateMonthBalance('2026-09', readings, [
      makePayment({ monthKey: '2026-09', amount: 100000 }),
    ]);
    const over = calculateMonthBalance('2026-09', readings, [
      makePayment({ monthKey: '2026-09', amount: 120000 }),
    ]);

    expect(exact).toMatchObject({ due: 0, isSettled: true });
    expect(over).toMatchObject({ due: -20000, isSettled: true });
  });

  it('не считает оплаченным период без начислений', () => {
    const balance = calculateMonthBalance('2026-01', readings, []);
    expect(balance).toMatchObject({ charged: 0, paid: 0, due: 0, isSettled: false });
  });

  it('складывает несколько платежей за один период', () => {
    const balance = calculateMonthBalance('2026-09', readings, [
      makePayment({ id: 'a', monthKey: '2026-09', amount: 40000 }),
      makePayment({ id: 'b', monthKey: '2026-09', amount: 60000 }),
    ]);
    expect(balance.paid).toBe(100000);
    expect(balance.isSettled).toBe(true);
  });

  it('перечисляет балансы всех периодов с начислениями или платежами', () => {
    const balances = calculateAllBalances(readings, [
      makePayment({ monthKey: '2026-07', amount: 5000 }),
    ]);
    expect(balances.map(b => b.monthKey)).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('суммирует только долги, не вычитая переплаты других месяцев', () => {
    const debt = calculateTotalDebt(readings, [
      makePayment({ id: 'a', monthKey: '2026-09', amount: 40000 }), // долг 60 000
      makePayment({ id: 'b', monthKey: '2026-08', amount: 100000 }), // переплата 20 000
    ]);
    expect(debt).toBe(60000);
  });
});

describe('generateTelegramReport', () => {
  const readings: ReadingEntry[] = [
    makeReading({
      id: 'el',
      date: '2026-09-25',
      meterType: 'electricity',
      reading: 14980,
      previousReading: 14810,
      consumption: 170,
      cost: 76500,
    }),
    makeReading({ id: 'old', date: '2026-08-25', meterType: 'gas', cost: 19500 }),
  ];

  it('включает только записи выбранного месяца и считает итог', () => {
    const report = generateTelegramReport({
      monthKey: '2026-09',
      propertyName: 'Квартира',
      readings,
      currency: 'сум',
      t: ru,
    });

    expect(report).toContain('Сентябрь 2026');
    expect(report).toContain('Квартира');
    expect(report).toContain('14 810');
    expect(report).toContain('+170 кВт⋅ч');
    expect(report).toContain('ИТОГО К ОПЛАТЕ: 76 500 сум');
    expect(report).not.toContain('Природный газ');
  });

  it('формируется на узбекском языке', () => {
    const report = generateTelegramReport({
      monthKey: '2026-09',
      propertyName: 'Kvartira',
      readings,
      currency: "so'm",
      t: uz,
    });

    expect(report).toContain('Sentabr 2026');
    expect(report).toContain('Elektr energiyasi');
    expect(report).toContain('+170 kVt⋅s');
    expect(report).toContain("JAMI TO'LASH UCHUN");
  });

  it('сообщает об отсутствии данных за период', () => {
    const report = generateTelegramReport({
      monthKey: '2026-01',
      propertyName: 'Дача',
      readings,
      currency: 'сум',
      t: ru,
    });

    expect(report).toContain('Нет внесенных показаний за этот период');
    expect(report).toContain('ИТОГО К ОПЛАТЕ: 0 сум');
  });

  it('добавляет оплаченную сумму и остаток, когда есть платежи', () => {
    const report = generateTelegramReport({
      monthKey: '2026-09',
      propertyName: 'Квартира',
      readings,
      payments: [makePayment({ monthKey: '2026-09', amount: 50000 })],
      currency: 'сум',
      t: ru,
    });

    expect(report).toContain('Оплачено: 50 000 сум');
    expect(report).toContain('Остаток к оплате: 26 500 сум');
  });

  it('не показывает остаток, когда период закрыт', () => {
    const report = generateTelegramReport({
      monthKey: '2026-09',
      propertyName: 'Квартира',
      readings,
      payments: [makePayment({ monthKey: '2026-09', amount: 76500 })],
      currency: 'сум',
      t: ru,
    });

    expect(report).toContain('Оплачено: 76 500 сум');
    expect(report).not.toContain('Остаток к оплате');
  });

  it('помечает замену счетчика', () => {
    const report = generateTelegramReport({
      monthKey: '2026-09',
      propertyName: 'Квартира',
      readings: [makeReading({ date: '2026-09-25', isReplacement: true })],
      currency: 'сум',
      t: ru,
    });

    expect(report).toContain('Счетчик был заменен');
  });
});
