import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types';
import { SqliteRepository } from '../services/db/sqlite';

/** Имена виджетов — совпадают с объявленными в app.json */
export const WIDGET_NAMES = {
  small: 'CkomSmall',
  medium: 'CkomMedium',
  large: 'CkomLarge',
} as const;

export type WidgetSize = keyof typeof WIDGET_NAMES;
export const ALL_WIDGET_NAMES: string[] = Object.values(WIDGET_NAMES);

export type WidgetThemeSetting = 'system' | 'dark' | 'light';

/** Настройки одного экземпляра виджета на рабочем столе */
export interface WidgetConfig {
  propertyId?: string;
  theme: WidgetThemeSetting;
}

const CONFIG_KEY = '@ckom_widget_config';
const DEFAULT_CONFIG: WidgetConfig = { theme: 'system' };

/**
 * В конфигурации только id объекта и тема — без данных о расходах,
 * поэтому ее можно держать в AsyncStorage.
 */
async function readAll(): Promise<Record<string, WidgetConfig>> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getWidgetConfig(widgetId: number): Promise<WidgetConfig> {
  const all = await readAll();
  return { ...DEFAULT_CONFIG, ...all[String(widgetId)] };
}

export async function saveWidgetConfig(widgetId: number, config: WidgetConfig): Promise<void> {
  const all = await readAll();
  all[String(widgetId)] = config;
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(all));
}

export async function removeWidgetConfig(widgetId: number): Promise<void> {
  const all = await readAll();
  delete all[String(widgetId)];
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(all));
}

/**
 * Читает данные из зашифрованной базы отдельным соединением и только для чтения:
 * виджет никогда не создает базу, не меняет ее и не трогает ключ.
 */
export async function loadWidgetData(): Promise<AppData | null> {
  try {
    return await SqliteRepository.readOnlySnapshot();
  } catch (e) {
    console.warn('Виджет: не удалось прочитать данные', e);
    return null;
  }
}
