import { Language } from '../types';
import { ru } from './ru';
import { uz } from './uz';
import type { TranslationDictionary, TranslationKey, TranslationParams } from './types';

export type { TranslationKey, TranslationParams, TranslationDictionary };

export const DICTIONARIES: Record<Language, TranslationDictionary> = {
  ru,
  uz,
};

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'uz', label: "O'zbekcha" },
  { code: 'ru', label: 'Русский' },
];

/** Функция перевода, привязанная к одному языку */
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Возвращает строку по ключу и подставляет значения вида {{name}}.
 * Если ключ отсутствует в выбранном языке, берется русская строка, затем сам ключ.
 */
export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const template = DICTIONARIES[language]?.[key] ?? ru[key] ?? key;
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Создает функцию перевода для выбранного языка */
export function createTranslator(language: Language): Translate {
  return (key, params) => translate(language, key, params);
}
