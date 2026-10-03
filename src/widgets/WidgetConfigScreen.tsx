import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WidgetPreview } from 'react-native-android-widget';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import {
  useFonts,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
} from '@expo-google-fonts/onest';
import { AppData } from '../types';
import { createTranslator, type TranslationKey } from '../i18n';
import { DarkTheme, LightTheme, button, buttonText, font, fontSize, radius } from '../constants/theme';
import { buildWidgetModel } from './model';
import { EmptyWidget, LargeWidget, MediumWidget, SmallWidget } from './CkomWidgets';
import {
  WIDGET_NAMES,
  WidgetConfig,
  WidgetThemeSetting,
  getWidgetConfig,
  loadWidgetData,
  saveWidgetConfig,
} from './config';
import { renderCkomWidget } from './render';

const THEMES: WidgetThemeSetting[] = ['system', 'dark', 'light'];

function sizeOf(widgetName: string): 'small' | 'medium' | 'large' {
  if (widgetName === WIDGET_NAMES.small) return 'small';
  if (widgetName === WIDGET_NAMES.large) return 'large';
  return 'medium';
}

/** Размер предпросмотра в dp — пропорции как на рабочем столе */
const PREVIEW_SIZE = {
  small: { width: 170, height: 84 },
  medium: { width: 330, height: 160 },
  large: { width: 330, height: 330 },
};

/**
 * Окно настройки виджета: открывается системой, когда виджет добавляют
 * на рабочий стол или выбирают «Настроить». Здесь выбирают объект и оформление.
 */
export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [fontsLoaded] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
  });
  const systemScheme = useColorScheme();
  const [data, setData] = useState<AppData | null | undefined>(undefined);
  const [config, setConfig] = useState<WidgetConfig>({ theme: 'system' });

  useEffect(() => {
    Promise.all([loadWidgetData(), getWidgetConfig(widgetInfo.widgetId)]).then(([loaded, saved]) => {
      setData(loaded);
      setConfig({
        theme: saved.theme,
        propertyId:
          saved.propertyId ??
          loaded?.properties.find(p => p.isDefault)?.id ??
          loaded?.properties[0]?.id,
      });
    });
  }, [widgetInfo.widgetId]);

  // Оформление окна совпадает с приложением: язык и тема из настроек
  const isDark = data?.settings.theme ? data.settings.theme === 'dark' : systemScheme !== 'light';
  const theme = isDark ? DarkTheme : LightTheme;
  const t = useMemo(() => createTranslator(data?.settings.language ?? 'uz'), [data]);

  const size = sizeOf(widgetInfo.widgetName);
  const widgetSize = { width: widgetInfo.width, height: widgetInfo.height };
  const preview = PREVIEW_SIZE[size];
  const previewTheme =
    config.theme === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : config.theme;

  // Изменения сразу видны и на самом виджете
  useEffect(() => {
    if (data !== undefined) {
      renderWidget(renderCkomWidget(widgetInfo.widgetName, data, config, widgetSize));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, data]);

  const handleSave = async () => {
    await saveWidgetConfig(widgetInfo.widgetId, config);
    renderWidget(renderCkomWidget(widgetInfo.widgetName, data ?? null, config, widgetSize));
    setResult('ok');
  };

  if (!fontsLoaded || data === undefined) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const model = data ? buildWidgetModel(data, config.propertyId) : null;
  const Component = size === 'small' ? SmallWidget : size === 'large' ? LargeWidget : MediumWidget;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>{t('widget.configTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t(`widget.size.${size}` as TranslationKey)} — {t(`widget.hint.${size}` as TranslationKey)}
          </Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>{t('widget.preview')}</Text>
          <View style={[styles.previewBox, { backgroundColor: theme.surfaceLight }]}>
            <WidgetPreview
              width={preview.width}
              height={preview.height}
              renderWidget={() =>
                model ? (
                  <Component model={model} theme={previewTheme} size={preview} />
                ) : (
                  <EmptyWidget theme={previewTheme} text={t('widget.noData')} />
                )
              }
            />
          </View>

          {data && data.properties.length > 0 && (
            <>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{t('widget.property')}</Text>
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {data.properties.map((property, index) => {
                  const selected = property.id === config.propertyId;
                  return (
                    <TouchableOpacity
                      key={property.id}
                      style={[
                        styles.option,
                        index > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight },
                      ]}
                      onPress={() => setConfig(prev => ({ ...prev, propertyId: property.id }))}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={selected ? theme.primary : theme.textMuted}
                      />
                      <View style={styles.optionText}>
                        <Text style={[styles.optionTitle, { color: theme.text }]}>{property.name}</Text>
                        {property.address ? (
                          <Text style={[styles.optionSub, { color: theme.textMuted }]} numberOfLines={1}>
                            {property.address}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={[styles.label, { color: theme.textSecondary }]}>{t('widget.theme')}</Text>
          <View style={styles.segment}>
            {THEMES.map(option => {
              const selected = config.theme === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.segmentBtn,
                    {
                      backgroundColor: selected ? theme.primary : theme.surfaceLight,
                    },
                  ]}
                  onPress={() => setConfig(prev => ({ ...prev, theme: option }))}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: selected ? theme.onPrimary : theme.text },
                    ]}
                  >
                    {t(`widget.theme.${option}` as TranslationKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.footerBtn, { backgroundColor: theme.surfaceLight }]}
            onPress={() => setResult('cancel')}
          >
            <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, { backgroundColor: theme.primary }]}
            onPress={handleSave}
          >
            <Text style={[buttonText.md, { color: theme.onPrimary }]}>{t('widget.add')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: font.bold,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    lineHeight: 20,
    marginTop: 4,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
  },
  previewBox: {
    borderRadius: radius.xl,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  optionSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    ...button.md,
    flex: 1,
    paddingHorizontal: 8,
  },
  segmentText: {
    ...buttonText.md,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  footerBtn: {
    ...button.lg,
    flex: 1,
  },
});
