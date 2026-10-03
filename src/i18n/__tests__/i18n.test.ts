import { DICTIONARIES, LANGUAGES, createTranslator, translate } from '..';
import { ru } from '../ru';
import { uz } from '../uz';
import type { TranslationKey } from '../types';

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]).sort();
}

describe('словари переводов', () => {
  it('содержат одинаковый набор ключей', () => {
    const ruKeys = Object.keys(ru).sort();
    const uzKeys = Object.keys(uz).sort();

    expect(uzKeys).toEqual(ruKeys);
  });

  it('не содержат пустых строк', () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
      expect(Object.keys(dictionary).length).toBeGreaterThan(0);
      expect(language).toBeTruthy();
    }
  });

  it('используют одни и те же подстановки в обоих языках', () => {
    for (const key of Object.keys(ru) as TranslationKey[]) {
      expect(placeholdersOf(uz[key])).toEqual(placeholdersOf(ru[key]));
    }
  });

  it('перечисляют все языки в списке выбора', () => {
    expect(LANGUAGES.map(option => option.code).sort()).toEqual(Object.keys(DICTIONARIES).sort());
  });
});

describe('translate', () => {
  it('возвращает строку выбранного языка', () => {
    expect(translate('ru', 'tab.dashboard')).toBe('Главная');
    expect(translate('uz', 'tab.dashboard')).toBe('Asosiy');
  });

  it('подставляет значения в шаблон', () => {
    expect(translate('ru', 'stats.submittedProgress', { entered: 2, total: 4 })).toBe(
      'Внесено: 2 из 4 счетчиков'
    );
  });

  it('оставляет подстановку как есть, если значение не передано', () => {
    expect(translate('ru', 'stats.submittedProgress', { entered: 2 })).toContain('{{total}}');
  });

  it('игнорирует параметры у строк без подстановок', () => {
    expect(translate('ru', 'common.cancel', { unused: 1 })).toBe('Отмена');
  });

  it('подставляет числа и строки одинаково', () => {
    expect(translate('uz', 'settings.reminderDaySub', { day: 25 })).toContain('25');
  });

  it('падает на русский текст для неизвестного языка', () => {
    // Язык вне словаря возможен только из поврежденных данных
    expect(translate('de' as 'ru', 'common.cancel')).toBe('Отмена');
  });

  it('возвращает сам ключ, если строки нет нигде', () => {
    expect(translate('ru', 'nope.missing' as TranslationKey)).toBe('nope.missing');
  });
});

describe('createTranslator', () => {
  it('привязывает перевод к одному языку', () => {
    const t = createTranslator('uz');
    expect(t('common.save')).toBe('Saqlash');
    expect(t('payments.forPeriod', { period: 'Sentabr 2026' })).toBe('Sentabr 2026 uchun');
  });
});
