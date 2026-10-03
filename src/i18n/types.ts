import { ru } from './ru';

/** Ключ любой строки интерфейса. Эталон — русский словарь. */
export type TranslationKey = keyof typeof ru;

/** Полный словарь одного языка: все ключи обязательны. */
export type TranslationDictionary = Record<TranslationKey, string>;

/** Значения для подстановки вида {{name}} */
export type TranslationParams = Record<string, string | number>;
