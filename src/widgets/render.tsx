import React from 'react';
import type { WidgetRepresentation } from 'react-native-android-widget';
import { AppData } from '../types';
import { createTranslator } from '../i18n';
import { buildWidgetModel } from './model';
import {
  EmptyWidget,
  LargeWidget,
  MediumWidget,
  SmallWidget,
  WidgetSizeDp,
  WidgetThemeName,
} from './CkomWidgets';
import { WIDGET_NAMES, WidgetConfig } from './config';

function pickComponent(widgetName: string) {
  if (widgetName === WIDGET_NAMES.small) return SmallWidget;
  if (widgetName === WIDGET_NAMES.large) return LargeWidget;
  return MediumWidget;
}

/**
 * Отрисовка виджета по имени и настройкам. Тема «как в системе» отдает
 * обе версии — лаунчер сам переключает их вместе с темой телефона.
 */
export function renderCkomWidget(
  widgetName: string,
  data: AppData | null,
  config: WidgetConfig,
  /** Фактический размер виджета на рабочем столе — от него зависит масштаб */
  size?: WidgetSizeDp
): WidgetRepresentation {
  const model = data ? buildWidgetModel(data, config.propertyId) : null;
  const Component = pickComponent(widgetName);

  const build = (theme: WidgetThemeName) =>
    model ? (
      <Component model={model} theme={theme} size={size} />
    ) : (
      <EmptyWidget
        theme={theme}
        text={createTranslator(data?.settings.language ?? 'uz')('common.noData')}
      />
    );

  if (config.theme === 'system') {
    return { light: build('light'), dark: build('dark') };
  }
  return build(config.theme);
}
