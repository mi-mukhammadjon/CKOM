import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { AppData } from '../types';
import { ALL_WIDGET_NAMES, getWidgetConfig } from './config';
import { renderCkomWidget } from './render';

/**
 * Перерисовывает все виджеты на рабочем столе по свежим данным приложения.
 * Вызывается после любых изменений, чтобы виджет не ждал планового обновления.
 */
export async function updateAllWidgets(data: AppData): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    ALL_WIDGET_NAMES.map(widgetName =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: async info =>
          renderCkomWidget(widgetName, data, await getWidgetConfig(info.widgetId), {
            width: info.width,
            height: info.height,
          }),
      }).catch(e => console.warn('Не удалось обновить виджет', widgetName, e))
    )
  );
}
