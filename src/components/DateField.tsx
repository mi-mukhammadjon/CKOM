import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { formatDate, getTodayDateKey, isValidDateKey } from '../utils/calculator';
import { buildMonthGrid, toDateKey } from '../utils/calendar';
import type { TranslationKey } from '../i18n';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { AppModal } from './AppModal';

interface DateFieldProps {
  /** Дата в формате 'YYYY-MM-DD' */
  value: string;
  onChange: (value: string) => void;
  /** Самая поздняя доступная дата; по умолчанию — сегодня */
  maxDate?: string;
  invalid?: boolean;
}

/**
 * Поле даты: показывает дату словами и открывает календарь в оформлении приложения.
 * Вводить дату вручную не нужно — формат всегда правильный.
 */
export const DateField: React.FC<DateFieldProps> = ({ value, onChange, maxDate, invalid }) => {
  const { theme, t } = useApp();
  const [open, setOpen] = useState(false);

  const today = getTodayDateKey();
  const limit = maxDate ?? today;
  const selected = isValidDateKey(value) ? value : today;

  // Месяц, который показывает календарь
  const [view, setView] = useState(() => ({
    year: Number(selected.slice(0, 4)),
    month: Number(selected.slice(5, 7)),
  }));

  const openPicker = () => {
    setView({ year: Number(selected.slice(0, 4)), month: Number(selected.slice(5, 7)) });
    setOpen(true);
  };

  const weeks = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  // Листать вперед можно только до месяца последней доступной даты
  const canGoNext = toDateKey(view.year, view.month, 1).slice(0, 7) < limit.slice(0, 7);

  const shiftMonth = (delta: number) => {
    setView(prev => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  };

  const pick = (dateKey: string) => {
    onChange(dateKey);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.field,
          {
            backgroundColor: theme.inputBg,
            borderColor: invalid ? theme.danger : theme.inputBorder,
          },
        ]}
        onPress={openPicker}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('date.pickTitle')}
      >
        <Ionicons name="calendar-outline" size={20} color={theme.primary} />
        <Text style={[styles.fieldText, { color: theme.text }]}>
          {isValidDateKey(value) ? formatDate(value, t) : t('date.pickTitle')}
        </Text>
        {value === today && (
          <View style={[styles.todayTag, { backgroundColor: theme.badgeBg }]}>
            <Text style={[styles.todayTagText, { color: theme.primary }]}>{t('common.today')}</Text>
          </View>
        )}
        <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
      </TouchableOpacity>

      <AppModal
        visible={open}
        variant="center"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          {/* Нажатие по самой карточке не закрывает календарь */}
          <Pressable
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => undefined}
          >
            <Text style={[styles.caption, { color: theme.textSecondary }]}>
              {t('date.pickTitle')}
            </Text>
            <Text style={[styles.selectedTitle, { color: theme.text }]}>
              {formatDate(selected, t)}
            </Text>

            <View style={styles.monthRow}>
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: theme.surfaceLight }]}
                onPress={() => shiftMonth(-1)}
                accessibilityLabel={t('date.prevMonth')}
              >
                <Ionicons name="chevron-back" size={20} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: theme.text }]}>
                {t(`month.${view.month}` as TranslationKey)} {view.year}
              </Text>
              <TouchableOpacity
                style={[
                  styles.navBtn,
                  { backgroundColor: theme.surfaceLight, opacity: canGoNext ? 1 : 0.35 },
                ]}
                onPress={() => canGoNext && shiftMonth(1)}
                disabled={!canGoNext}
                accessibilityLabel={t('date.nextMonth')}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.week}>
              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                <Text
                  key={day}
                  style={[
                    styles.weekday,
                    { color: day >= 6 ? theme.danger : theme.textMuted },
                  ]}
                >
                  {t(`weekday.${day}` as TranslationKey)}
                </Text>
              ))}
            </View>

            {weeks.map((week, index) => (
              <View key={index} style={styles.week}>
                {week.map((day, dayIndex) => {
                  if (day === null) return <View key={dayIndex} style={styles.cell} />;

                  const dateKey = toDateKey(view.year, view.month, day);
                  const isSelected = dateKey === selected;
                  const isToday = dateKey === today;
                  const disabled = dateKey > limit;

                  return (
                    <TouchableOpacity
                      key={dayIndex}
                      style={styles.cell}
                      onPress={() => pick(dateKey)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isSelected && { backgroundColor: theme.primary },
                          !isSelected && isToday && { borderWidth: 1.5, borderColor: theme.primary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            {
                              color: isSelected
                                ? theme.onPrimary
                                : disabled
                                ? theme.border
                                : theme.text,
                              fontFamily: isSelected || isToday ? font.bold : font.medium,
                            },
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.footerBtn, { backgroundColor: theme.surfaceLight }]}
                onPress={() => setOpen(false)}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerBtn, { backgroundColor: theme.primary }]}
                onPress={() => pick(today <= limit ? today : limit)}
              >
                <Text style={[buttonText.md, { color: theme.onPrimary }]}>{t('common.today')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  fieldText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  todayTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  todayTagText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xxl,
    borderWidth: 1,
    padding: 18,
  },
  caption: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectedTitle: {
    fontSize: fontSize.xl,
    fontFamily: font.bold,
    marginTop: 4,
    marginBottom: 14,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: {
    ...button.icon,
    width: 38,
    height: 38,
  },
  monthTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    paddingVertical: 6,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: '86%',
    aspectRatio: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  footerBtn: {
    ...button.md,
    flex: 1,
  },
});
