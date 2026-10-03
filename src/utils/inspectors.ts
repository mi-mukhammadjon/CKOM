import { Inspector } from '../types';

/** Имя пользователя Telegram: 5–32 символа, латиница, цифры и подчеркивание */
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/**
 * Приводит введенный контакт Telegram к имени пользователя без @.
 * Принимает «@ivanov», «ivanov», «t.me/ivanov», «https://t.me/ivanov».
 * Возвращает null, если имя некорректно; пустая строка — пустой результат.
 */
export function normalizeTelegramUsername(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  const username = value
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];

  return TELEGRAM_USERNAME.test(username) ? username : null;
}

/**
 * Приводит номер телефона к виду +998901234567: оставляет цифры и ведущий плюс.
 * Возвращает null, если цифр слишком мало или много; пустая строка — пустой результат.
 */
export function normalizePhone(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return value.startsWith('+') ? `+${digits}` : digits;
}

/**
 * Ссылка на чат с инспектором в Telegram. Открывается сразу в приложении Telegram,
 * а если его нет — в браузере. Без имени пользователя используется номер телефона
 * (сработает, если инспектор разрешил поиск по номеру).
 */
export function getTelegramLink(inspector: Pick<Inspector, 'telegram' | 'phone'>): string | null {
  if (inspector.telegram) return `https://t.me/${inspector.telegram}`;
  if (inspector.phone && inspector.phone.startsWith('+')) {
    return `https://t.me/${inspector.phone}`;
  }
  return null;
}

/** Ссылка для звонка */
export function getPhoneLink(inspector: Pick<Inspector, 'phone'>): string | null {
  return inspector.phone ? `tel:${inspector.phone}` : null;
}

/** У инспектора заполнено хотя бы одно поле */
export function hasInspectorDetails(inspector: Partial<Inspector>): boolean {
  return !!(
    inspector.name ||
    inspector.organization ||
    inspector.phone ||
    inspector.telegram ||
    inspector.notes
  );
}

/** Код Узбекистана — неизменяемая часть поля телефона */
export const UZ_PHONE_PREFIX = '+998';
const UZ_LOCAL_LENGTH = 9;

/**
 * Форматирует 9 цифр после +998 как «(78) 000-00-00». Разделители добавляются
 * только перед следующей цифрой, поэтому строка никогда не заканчивается
 * разделителем и Backspace всегда стирает цифру.
 */
export function formatUzLocal(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, UZ_LOCAL_LENGTH);
  if (!d) return '';
  let out = `(${d.slice(0, 2)}`;
  if (d.length > 2) out += `) ${d.slice(2, 5)}`;
  if (d.length > 5) out += `-${d.slice(5, 7)}`;
  if (d.length > 7) out += `-${d.slice(7, 9)}`;
  return out;
}

/** Цифры номера после +998 (для старых записей в другом формате — последние 9 цифр) */
export function uzLocalDigits(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > UZ_LOCAL_LENGTH) {
    return digits.slice(3, 3 + UZ_LOCAL_LENGTH);
  }
  return digits.slice(-UZ_LOCAL_LENGTH);
}

/** Номер для показа: «+998 (78) 000-00-00»; неполный номер — как есть */
export function formatUzPhone(phone?: string): string {
  if (!phone) return '';
  const digits = uzLocalDigits(phone);
  return digits.length === UZ_LOCAL_LENGTH ? `${UZ_PHONE_PREFIX} ${formatUzLocal(digits)}` : phone;
}

/** Хранимое значение: «+998XXXXXXXXX» или пустая строка */
export function toStoredUzPhone(digits: string): string {
  return digits ? `${UZ_PHONE_PREFIX}${digits}` : '';
}

/**
 * Новые цифры номера после правки отформатированного текста.
 * Если пользователь стер разделитель («-», «)», пробел), стирается цифра перед ним —
 * отдельно удалять разделители не нужно. Вставленный номер с кодом 998 не дублирует код.
 */
export function applyUzPhoneEdit(prevDigits: string, prevText: string, nextText: string): string {
  let digits = nextText.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > UZ_LOCAL_LENGTH) digits = digits.slice(3);
  digits = digits.slice(0, UZ_LOCAL_LENGTH);

  const removedOnlySeparator = nextText.length < prevText.length && digits === prevDigits;
  if (removedOnlySeparator && prevDigits.length > 0) {
    // Позиция первого расхождения — там стоял удаленный разделитель
    let index = 0;
    while (index < nextText.length && nextText[index] === prevText[index]) index++;
    const digitsBefore = prevText.slice(0, index).replace(/\D/g, '').length;
    if (digitsBefore === 0) return prevDigits;
    return prevDigits.slice(0, digitsBefore - 1) + prevDigits.slice(digitsBefore);
  }
  return digits;
}
