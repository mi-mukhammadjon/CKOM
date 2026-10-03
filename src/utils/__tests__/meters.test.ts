import { Meter, ReadingEntry } from '../../types';
import { METER_PRESETS } from '../../constants/defaults';
import { hasReadingHistory, needsInitialReading } from '../meters';

function meter(extra: Partial<Meter> = {}): Meter {
  return {
    ...METER_PRESETS.gas,
    id: 'm1',
    propertyId: 'prop-1',
    currentReading: 0,
    lastReadingDate: '',
    ...extra,
  };
}

const reading: ReadingEntry = {
  id: 'r1',
  meterId: 'm1',
  meterType: 'gas',
  propertyId: 'prop-1',
  date: '2026-10-02',
  reading: 120,
  previousReading: 100,
  consumption: 20,
  cost: 13000,
  createdAt: '2026-10-02T10:00:00Z',
};

describe('needsInitialReading', () => {
  it('новый счетчик без записей ждет начальных цифр', () => {
    expect(needsInitialReading(meter(), [])).toBe(true);
  });

  it('после ввода начальных цифр счетчик больше не ждет', () => {
    expect(needsInitialReading(meter({ currentReading: 100, lastReadingDate: '2026-10-01' }), [])).toBe(false);
  });

  it('счетчик с записями в журнале не ждет начальных цифр', () => {
    expect(needsInitialReading(meter(), [reading])).toBe(false);
  });
});

describe('hasReadingHistory', () => {
  it('учитывает только записи своего счетчика', () => {
    expect(hasReadingHistory('m1', [reading])).toBe(true);
    expect(hasReadingHistory('m2', [reading])).toBe(false);
  });
});
