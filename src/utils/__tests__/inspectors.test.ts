import {
  applyUzPhoneEdit,
  formatUzLocal,
  formatUzPhone,
  getPhoneLink,
  getTelegramLink,
  normalizePhone,
  normalizeTelegramUsername,
  toStoredUzPhone,
  uzLocalDigits,
} from '../inspectors';

describe('normalizeTelegramUsername', () => {
  it.each([
    ['@ivanov_uz', 'ivanov_uz'],
    ['ivanov_uz', 'ivanov_uz'],
    ['t.me/ivanov_uz', 'ivanov_uz'],
    ['https://t.me/ivanov_uz', 'ivanov_uz'],
    ['https://telegram.me/ivanov_uz/', 'ivanov_uz'],
    ['  @Ivanov_UZ  ', 'Ivanov_UZ'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTelegramUsername(input)).toBe(expected);
  });

  it('пустая строка — нет значения', () => {
    expect(normalizeTelegramUsername('   ')).toBeUndefined();
  });

  it.each(['@abc', 'иванов', '1ivanov', 'ivan ov', '@'])('отклоняет «%s»', input => {
    expect(normalizeTelegramUsername(input)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('оставляет плюс и цифры', () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  it('номер без плюса остается без плюса', () => {
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
  });

  it('отклоняет слишком короткий номер', () => {
    expect(normalizePhone('12-34')).toBeNull();
  });

  it('пустая строка — нет значения', () => {
    expect(normalizePhone('')).toBeUndefined();
  });
});

describe('ссылки', () => {
  it('Telegram открывается по имени пользователя', () => {
    expect(getTelegramLink({ telegram: 'ivanov_uz', phone: '+998901234567' })).toBe(
      'https://t.me/ivanov_uz'
    );
  });

  it('без имени Telegram открывается по номеру в международном формате', () => {
    expect(getTelegramLink({ phone: '+998901234567' })).toBe('https://t.me/+998901234567');
  });

  it('по номеру без кода страны Telegram не открыть', () => {
    expect(getTelegramLink({ phone: '901234567' })).toBeNull();
  });

  it('ссылка для звонка', () => {
    expect(getPhoneLink({ phone: '+998901234567' })).toBe('tel:+998901234567');
  });
});

describe('телефон +998', () => {
  it.each([
    ['', ''],
    ['7', '(7'],
    ['78', '(78'],
    ['781', '(78) 1'],
    ['78123', '(78) 123'],
    ['781234', '(78) 123-4'],
    ['7812345', '(78) 123-45'],
    ['78123456', '(78) 123-45-6'],
    ['781234567', '(78) 123-45-67'],
    ['7812345678', '(78) 123-45-67'],
  ])('цифры %s → %s', (digits, expected) => {
    expect(formatUzLocal(digits)).toBe(expected);
  });

  it('показывает полный номер в едином формате', () => {
    expect(formatUzPhone('+998781234567')).toBe('+998 (78) 123-45-67');
  });

  it('Backspace в конце стирает цифру', () => {
    expect(applyUzPhoneEdit('781234', '(78) 123-4', '(78) 123-')).toBe('78123');
  });

  it('стертый разделитель в середине удаляет цифру перед ним', () => {
    // курсор после «-», стерли сам «-»
    expect(applyUzPhoneEdit('7812345', '(78) 123-45', '(78) 12345')).toBe('781245');
  });

  it('стертая скобка удаляет вторую цифру кода', () => {
    expect(applyUzPhoneEdit('781', '(78) 1', '(78 1')).toBe('71');
  });

  it('ввод цифры добавляет ее', () => {
    expect(applyUzPhoneEdit('78', '(78', '(781')).toBe('781');
  });

  it('вставка номера с кодом страны не дублирует 998', () => {
    expect(applyUzPhoneEdit('', '', '+998 90 123 45 67')).toBe('901234567');
  });

  it('хранимое значение и обратное чтение', () => {
    expect(toStoredUzPhone('901234567')).toBe('+998901234567');
    expect(toStoredUzPhone('')).toBe('');
    expect(uzLocalDigits('+998901234567')).toBe('901234567');
  });
});
