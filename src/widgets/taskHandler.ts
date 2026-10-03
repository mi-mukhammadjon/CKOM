import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getWidgetConfig, loadWidgetData, removeWidgetConfig } from './config';
import { renderCkomWidget } from './render';

/**
 * Обработчик событий виджета. Вызывается системой, в том числе когда
 * приложение закрыто: при добавлении, плановом обновлении (раз в 30 минут)
 * и изменении размера.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const [data, config] = await Promise.all([
        loadWidgetData(),
        getWidgetConfig(widgetInfo.widgetId),
      ]);
      props.renderWidget(
        renderCkomWidget(widgetInfo.widgetName, data, config, {
          width: widgetInfo.width,
          height: widgetInfo.height,
        })
      );
      break;
    }
    case 'WIDGET_DELETED':
      await removeWidgetConfig(widgetInfo.widgetId);
      break;
    default:
      // Нажатия обрабатываются системой: OPEN_APP и OPEN_URI
      break;
  }
}
