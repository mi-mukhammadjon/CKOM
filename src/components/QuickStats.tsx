import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import {
  calculateMonthBalance,
  calculateMonthSummaries,
  formatNumber,
  getCurrentMonthKey,
  getMonthTitle,
} from '../utils/calculator';
import { HERO_GLOW, button, buttonText, font, fontSize, radius, INK_ON_BRIGHT } from '../constants/theme';

interface QuickStatsProps {
  onEnterReading: () => void;
}

/**
 * Главная карточка экрана: сумма начислений за текущий месяц,
 * динамика к прошлому месяцу, срок сдачи и состояние оплаты.
 */
export const QuickStats: React.FC<QuickStatsProps> = ({ onEnterReading }) => {
  const { theme, readings, payments, settings, meters, t } = useApp();

  // Период — всегда календарный текущий месяц, а не последний месяц с данными
  const currentMonthKey = getCurrentMonthKey();
  const summaries = calculateMonthSummaries(readings, t);
  const currentMonth = summaries.find(s => s.monthKey === currentMonthKey);
  const previousMonth = summaries.find(s => s.monthKey < currentMonthKey);
  const balance = calculateMonthBalance(currentMonthKey, readings, payments);
  const totalCost = currentMonth ? currentMonth.totalCost : 0;

  let diffPercentage: number | null = null;
  if (currentMonth && previousMonth && previousMonth.totalCost > 0) {
    diffPercentage = Math.round(
      ((currentMonth.totalCost - previousMonth.totalCost) / previousMonth.totalCost) * 100
    );
  }

  // Сколько счетчиков объекта уже сданы в этом месяце (считаем счетчики, а не записи)
  const enteredMetersCount = new Set(
    readings.filter(r => r.date.startsWith(currentMonthKey)).map(r => r.meterId)
  ).size;
  const totalMeters = meters.length;
  const isAllSubmitted = totalMeters > 0 && enteredMetersCount >= totalMeters;

  const reminderDay = settings.reminderDay || 25;
  const daysUntilDeadline = reminderDay - new Date().getDate();

  const chips: { key: string; text: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }[] = [];

  if (diffPercentage !== null) {
    chips.push({
      key: 'diff',
      text: t('stats.vsPrev', {
        value: `${diffPercentage > 0 ? '↑' : '↓'} ${Math.abs(diffPercentage)}%`,
      }),
      tone: diffPercentage > 0 ? 'bad' : 'good',
    });
  }

  if (totalMeters > 0) {
    if (isAllSubmitted) {
      chips.push({ key: 'status', text: t('stats.allDone'), tone: 'good' });
    } else {
      chips.push({
        key: 'status',
        text: t('stats.progressShort', { entered: enteredMetersCount, total: totalMeters }),
        tone: 'neutral',
      });
      if (daysUntilDeadline >= 0) {
        chips.push({
          key: 'deadline',
          text:
            daysUntilDeadline === 0
              ? t('stats.deadlineTodayShort')
              : t('stats.deadlineShort', { day: reminderDay }),
          tone: 'warn',
        });
      }
    }
  }

  // Платежный статус показываем только когда уже есть начисления
  if (balance.charged > 0) {
    if (balance.due > 0) {
      chips.push({
        key: 'pay',
        text: t('stats.due', { amount: `${formatNumber(balance.due)} ${settings.currency}` }),
        tone: 'bad',
      });
    } else if (balance.due < 0) {
      chips.push({
        key: 'pay',
        text: t('stats.overpaid', { amount: `${formatNumber(-balance.due)} ${settings.currency}` }),
        tone: 'good',
      });
    } else {
      chips.push({ key: 'pay', text: t('stats.settled'), tone: 'good' });
    }
  }

  const chipColors = {
    neutral: { bg: theme.heroChipBg, fg: theme.heroText },
    good: { bg: 'rgba(61, 220, 151, 0.18)', fg: '#BDF5DB' },
    warn: { bg: 'rgba(255, 181, 71, 0.2)', fg: '#FFE2B0' },
    bad: { bg: 'rgba(255, 107, 122, 0.2)', fg: '#FFD0D5' },
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.heroBg, experimental_backgroundImage: HERO_GLOW },
      ]}
    >
      <Text style={[styles.label, { color: theme.heroTextMuted }]}>
        {t('stats.heroLabel', { month: getMonthTitle(currentMonthKey, t) })}
      </Text>

      <View style={styles.sumRow}>
        <Text style={[styles.sum, { color: theme.heroText }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatNumber(totalCost)}
        </Text>
        <Text style={[styles.currency, { color: theme.heroTextMuted }]}>{settings.currency}</Text>
      </View>

      {/* Структура затрат по ресурсам */}
      {totalCost > 0 && currentMonth && (
        <View style={styles.breakdown}>
          {meters.map(m => {
            const cost = currentMonth.byMeter[m.type]?.cost || 0;
            if (cost <= 0) return null;
            return <View key={m.id} style={{ flex: cost, backgroundColor: m.color }} />;
          })}
        </View>
      )}

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map(chip => (
            <View key={chip.key} style={[styles.chip, { backgroundColor: chipColors[chip.tone].bg }]}>
              <Text style={[styles.chipText, { color: chipColors[chip.tone].fg }]}>{chip.text}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: '#FFFFFF' }]}
        onPress={onEnterReading}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={20} color={INK_ON_BRIGHT} />
        <Text style={[styles.ctaText, { color: INK_ON_BRIGHT }]}>{t('entry.title')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xxl,
    padding: 18,
    gap: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  label: {
    fontSize: fontSize.sm,
    fontFamily: font.medium,
  },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  sum: {
    fontSize: 40,
    fontFamily: font.extrabold,
    letterSpacing: -1,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  currency: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  breakdown: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  cta: {
    ...button.md,
    marginTop: 2,
  },
  ctaText: {
    ...buttonText.lg,
  },
});
