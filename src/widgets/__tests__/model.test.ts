import { buildWidgetModel } from '../model';
import { cleanAppData } from '../../services/normalize';
import { getCurrentMonthKey } from '../../utils/calculator';
import { AppData, ReadingEntry } from '../../types';

function reading(meterId: string, consumption: number, cost: number): ReadingEntry {
  const month = getCurrentMonthKey();
  return {
    id: `r-${meterId}`,
    meterId,
    meterType: meterId.includes('electricity') ? 'electricity' : 'cold_water',
    propertyId: 'prop-1',
    date: `${month}-02`,
    reading: 1000 + consumption,
    previousReading: 1000,
    consumption,
    cost,
    createdAt: `${month}-02T10:00:00Z`,
  };
}

function sample(): AppData {
  const data = cleanAppData();
  return {
    ...data,
    settings: { ...data.settings, language: 'ru' },
    readings: [
      reading('meter-electricity-prop-1', 240, 126000),
      reading('meter-cold_water-prop-1', 8, 11200),
    ],
  };
}

describe('buildWidgetModel', () => {
  it('считает сумму за текущий месяц и сданные счетчики', () => {
    const model = buildWidgetModel(sample(), 'prop-1')!;
    expect(model.total).toBe('137 200');
    expect(model.entered).toBe(2);
    expect(model.totalMeters).toBe(4);
    expect(model.meters.find(m => m.type === 'electricity')?.consumption).toBe('+240');
    expect(model.breakdown.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1);
  });

  it('удаленный объект заменяется объектом по умолчанию', () => {
    const model = buildWidgetModel(sample(), 'prop-deleted');
    expect(model?.propertyName).toBe(cleanAppData().properties[0].name);
  });

  it('без объектов виджету нечего показывать', () => {
    expect(buildWidgetModel({ ...sample(), properties: [] })).toBeNull();
  });
});
