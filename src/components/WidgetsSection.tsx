import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import type { TranslationKey } from '../i18n';
import { WIDGET_NAMES, WidgetSize } from '../widgets/config';
import { font, fontSize, radius } from '../constants/theme';
import { appAlert } from './AppDialog';

const SIZES: { size: WidgetSize; cols: number; rows: number }[] = [
  { size: 'small', cols: 2, rows: 1 },
  { size: 'medium', cols: 4, rows: 2 },
  { size: 'large', cols: 4, rows: 4 },
];

/**
 * Раздел настроек с виджетами рабочего стола: по нажатию телефон
 * предлагает поставить виджет выбранного размера.
 */
export const WidgetsSection: React.FC = () => {
  const { theme, t } = useApp();
  if (Platform.OS !== 'android') return null;

  const pin = async (size: WidgetSize) => {
    let accepted = false;
    try {
      const { requestPinWidget } = require('react-native-android-widget');
      accepted = await requestPinWidget({ widgetName: WIDGET_NAMES[size] });
    } catch {
      accepted = false;
    }
    if (!accepted) {
      appAlert(t(`widget.size.${size}` as TranslationKey), t('widget.pinFailed'));
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('widget.section')}</Text>
      <Text style={[styles.sectionHint, { color: theme.textMuted }]}>{t('widget.sectionHint')}</Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {SIZES.map(({ size, cols, rows }, index) => (
          <TouchableOpacity
            key={size}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight },
            ]}
            onPress={() => pin(size)}
            activeOpacity={0.7}
          >
            {/* Схема размера: клетки рабочего стола, занятые виджетом */}
            <View style={[styles.gridBox, { backgroundColor: theme.surfaceLight }]}>
              <View
                style={[
                  styles.gridShape,
                  {
                    width: cols * 7 + (cols - 1) * 2,
                    height: rows * 7 + (rows - 1) * 2,
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </View>
            <View style={styles.info}>
              <Text style={[styles.title, { color: theme.text }]}>
                {t(`widget.size.${size}` as TranslationKey)}
              </Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {t(`widget.hint.${size}` as TranslationKey)}
              </Text>
            </View>
            <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 8,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gridBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridShape: {
    borderRadius: 3,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  hint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 17,
    marginTop: 2,
  },
});
