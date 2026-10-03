import { AppData, Meter, ReadingEntry } from '../../types';
import { DEFAULT_SETTINGS, DEFAULT_TARIFFS, METER_PRESETS } from '../../constants/defaults';
import { cleanAppData, normalizeAppData, stripSampleData } from '../normalize';

function meter(id: string, propertyId: string, extra: Partial<Meter> = {}): Meter {
  return {
    ...METER_PRESETS.electricity,
    id,
    propertyId,
    currentReading: 0,
    lastReadingDate: '',
    ...extra,
  };
}

function reading(id: string, meterId: string, propertyId: string): ReadingEntry {
  return {
    id,
    meterId,
    meterType: 'electricity',
    propertyId,
    date: '2026-09-25',
    reading: 100,
    previousReading: 0,
    consumption: 100,
    cost: 45000,
    createdAt: '2026-09-25T10:00:00Z',
  };
}

/** Состояние прежней версии с загруженными демо-данными */
function legacyDemoData(): AppData {
  return {
    properties: [
      { id: 'prop-1', name: 'Квартира', address: 'ул. Амира Темура, 45, кв. 18', isDefault: true },
      { id: 'prop-2', name: 'Загородный дом / Дача', address: 'Ташкентская обл., Бостанлыкский р-н' },
    ],
    meters: [
      meter('meter-electricity', 'prop-1', {
        currentReading: 14980,
        lastReadingDate: '2026-09-25',
        serialNumber: 'SE-984321',
      }),
      meter('meter-electricity-prop-2', 'prop-2'),
    ],
    readings: [reading('read-sep-el', 'meter-electricity', 'prop-1')],
    payments: [],
    inspectors: [],
    tariffs: DEFAULT_TARIFFS,
    settings: DEFAULT_SETTINGS,
  };
}

describe('stripSampleData', () => {
  it('не меняет чистые данные', () => {
    const data = cleanAppData();
    expect(stripSampleData(data)).toBe(data);
  });

  it('удаляет демо-историю, демо-объект и выдуманный адрес', () => {
    const result = stripSampleData(legacyDemoData());

    expect(result.readings).toHaveLength(0);
    expect(result.properties).toEqual([{ id: 'prop-1', name: 'Квартира', isDefault: true }]);
    expect(result.meters).toHaveLength(1);
    expect(result.meters[0]).toMatchObject({ currentReading: 0, lastReadingDate: '' });
    expect(result.meters[0].serialNumber).toBeUndefined();
  });

  it('сохраняет данные пользователя', () => {
    const data = legacyDemoData();
    data.readings.push(reading('read_user_1', 'meter-electricity', 'prop-1'));
    data.readings.push(reading('read_user_2', 'meter-electricity-prop-2', 'prop-2'));

    const result = stripSampleData(data);

    expect(result.readings.map(r => r.id)).toEqual(['read_user_1', 'read_user_2']);
    // У «Дачи» есть свои показания — объект остается
    expect(result.properties.map(p => p.id)).toEqual(['prop-1', 'prop-2']);
    // У счетчика есть показания пользователя — его номер не сбрасывается
    expect(result.meters[0].serialNumber).toBe('SE-984321');
  });
});

describe('normalizeAppData: инспекторы', () => {
  const base = { id: 'i1', propertyId: 'prop-1', meterType: 'gas' as const, updatedAt: '2026-10-03T10:00:00Z' };

  it('старые бэкапы без инспекторов читаются как пустой список', () => {
    const { inspectors, ...legacy } = cleanAppData();
    expect(normalizeAppData(legacy).inspectors).toEqual([]);
  });

  it('отбрасывает инспекторов удаленного объекта и дубликаты по виду ресурса', () => {
    const data = {
      ...cleanAppData(),
      inspectors: [
        { ...base, name: '  Алиев Вали  ', telegram: '' },
        { ...base, id: 'i2', name: 'Дубликат' },
        { ...base, id: 'i3', propertyId: 'prop-unknown' },
      ],
    };
    const result = normalizeAppData(data).inspectors;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'i1', name: 'Алиев Вали' });
    expect(result[0].telegram).toBeUndefined();
  });
});
