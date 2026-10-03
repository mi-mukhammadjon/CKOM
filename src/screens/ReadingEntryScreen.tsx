import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { PhotoField } from '../components/PhotoField';
import { deletePhoto } from '../services/photos';
import {
  getCostBreakdown,
  formatCurrency,
  formatNumber,
  formatDate,
  getMeterUnitLabel,
  getTodayDateKey,
  isValidDateKey,
} from '../utils/calculator';
import {
  getMeterIcon,
  getMeterTypeLabel,
  getMeterTypeShortLabel,
  needsInitialReading,
  resolveMeterName,
} from '../utils/meters';
import { font, fontSize, button, buttonText, radius, INK_ON_BRIGHT } from '../constants/theme';
import { appAlert, appError, appSuccess } from '../components/AppDialog';
import { DateField } from '../components/DateField';
import { byOldestReading, previousReadingFor } from '../utils/readings';

/** Текст поверх фирменных цветов ресурсов — все они светлые */
const ON_METER_COLOR = INK_ON_BRIGHT;

interface ReadingEntryScreenProps {
  initialMeterId?: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export const ReadingEntryScreen: React.FC<ReadingEntryScreenProps> = ({
  initialMeterId,
  onSuccess,
  onCancel,
}) => {
  const { theme, meters, readings, tariffs, addReading, setInitialReadings, settings, t } = useApp();

  const [selectedMeterId, setSelectedMeterId] = useState<string>(
    initialMeterId || (meters[0]?.id ?? '')
  );
  const [readingInput, setReadingInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>(getTodayDateKey);
  const [notes, setNotes] = useState<string>('');
  const [isReplacement, setIsReplacement] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Первое показание счетчика сохраняется как начальная точка, без начисления */
  const [saveAsInitial, setSaveAsInitial] = useState(true);

  const selectedMeter = meters.find(m => m.id === selectedMeterId) || meters[0];
  const tariff = selectedMeter
    ? tariffs.find(item => item.meterType === selectedMeter.type)
    : undefined;
  const unit = selectedMeter ? getMeterUnitLabel(selectedMeter.type, t) : '';

  // Синхронизация с выбором счетчика на главном экране
  useEffect(() => {
    if (initialMeterId) {
      setSelectedMeterId(initialMeterId);
    }
  }, [initialMeterId]);

  // При смене объекта выбранный счетчик может исчезнуть из списка
  useEffect(() => {
    if (meters.length > 0 && !meters.some(m => m.id === selectedMeterId)) {
      setSelectedMeterId(meters[0].id);
      setIsReplacement(false);
    }
  }, [meters, selectedMeterId]);

  // У счетчика нет ни истории, ни начальных цифр: первое число станет точкой отсчета
  const isFirstReading = !!selectedMeter && needsInitialReading(selectedMeter, readings);
  const isInitialMode = isFirstReading && saveAsInitial;

  useEffect(() => {
    setSaveAsInitial(true);
  }, [selectedMeterId]);

  // «Было» — та же логика, что при сохранении: последняя запись до выбранной даты
  const meterReadings = selectedMeter ? readings.filter(r => r.meterId === selectedMeter.id) : [];
  const priorEntry = [...meterReadings]
    .sort(byOldestReading)
    .filter(r => r.date <= dateInput)
    .pop();
  const storedPrevReading = selectedMeter
    ? previousReadingFor(
        // '9999' сортируется после любого времени: новая запись — последняя за этот день
        { date: dateInput, createdAt: '9999' },
        meterReadings,
        selectedMeter.currentReading
      )
    : 0;
  const prevReadingDate = priorEntry?.date ?? selectedMeter?.lastReadingDate ?? '';
  // После замены счетчика отсчет идет с нуля
  const prevReading = isReplacement ? 0 : storedPrevReading;
  const numInput = parseFloat(readingInput.replace(',', '.'));
  const isValidNum = !isNaN(numInput) && numInput >= 0;
  const isDateValid = isValidDateKey(dateInput);

  const consumption = isValidNum ? Math.max(0, numInput - prevReading) : 0;
  const isLowerThanPrev = isValidNum && !isReplacement && numInput < storedPrevReading;

  const breakdown = getCostBreakdown(consumption, tariff);
  const canSubmit = isValidNum && isDateValid && !!selectedMeter;

  const resetForm = () => {
    setReadingInput('');
    setNotes('');
    setIsReplacement(false);
    setPhoto(undefined);
  };

  const handlePhotoChange = (fileName: string | null) => {
    // Снимок, который заменили до сохранения записи, в хранилище уже не нужен
    if (photo && photo !== fileName) deletePhoto(photo);
    setPhoto(fileName || undefined);
  };

  const handleSave = async () => {
    if (!isValidNum) {
      appError(t('entry.invalidNumberTitle'), t('entry.invalidNumberText'));
      return;
    }

    if (!isDateValid) {
      appError(
        t('entry.invalidDateTitle'),
        t('common.dateFormatHint', { example: getTodayDateKey() })
      );
      return;
    }

    if (isInitialMode) {
      await submitInitial();
      return;
    }

    if (isLowerThanPrev) {
      appAlert(
        t('entry.lowerAlertTitle'),
        t('entry.lowerAlertText', {
          value: formatNumber(numInput),
          prev: formatNumber(storedPrevReading),
        }),
        [
          { text: t('entry.lowerAlertFix'), style: 'cancel' },
          {
            text: t('entry.lowerAlertReplaced'),
            onPress: async () => {
              setIsReplacement(true);
              await submitData(true);
            },
          },
        ]
      );
      return;
    }

    await submitData(isReplacement);
  };

  const submitInitial = async () => {
    try {
      setIsSubmitting(true);
      await setInitialReadings([{ meterId: selectedMeter.id, reading: numInput }], dateInput);
      resetForm();
      appSuccess(
        t('initial.savedTitle'),
        t('entry.initialSavedText', {
          meter: resolveMeterName(selectedMeter, t),
          value: formatNumber(numInput),
          unit,
        }),
        [{ text: t('common.ok'), onPress: onSuccess }]
      );
    } catch (e) {
      appError(t('common.error'), t('entry.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitData = async (replacement: boolean) => {
    const effectivePrev = replacement ? 0 : storedPrevReading;
    const effectiveConsumption = Math.max(0, numInput - effectivePrev);
    const effectiveCost = getCostBreakdown(effectiveConsumption, tariff).totalCost;

    try {
      setIsSubmitting(true);
      await addReading({
        meterId: selectedMeter.id,
        meterType: selectedMeter.type,
        reading: numInput,
        date: dateInput,
        notes: notes.trim() || undefined,
        isReplacement: replacement,
        photo,
      });

      // Форму очищаем сразу: счетчик уже получил новое показание, и без очистки
      // под диалогом мелькал бы пересчет «+0 / 0 сум»
      resetForm();

      appSuccess(
        t('entry.savedTitle'),
        t('entry.savedText', {
          meter: resolveMeterName(selectedMeter, t),
          consumption: formatNumber(effectiveConsumption),
          unit,
          cost: formatCurrency(effectiveCost, settings.currency),
        }),
        [
          {
            text: t('common.ok'),
            onPress: onSuccess,
          },
        ]
      );
    } catch (e) {
      appError(t('common.error'), t('entry.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedMeter) {
    return (
      <View style={[styles.container, styles.emptyWrap, { backgroundColor: theme.background }]}>
        <Ionicons name="speedometer-outline" size={44} color={theme.textMuted} />
        <Text style={[styles.title, { color: theme.text, marginTop: 12 }]}>
          {t('entry.emptyTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign: 'center' }]}>
          {t('entry.emptyText')}
        </Text>
        {onCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={[styles.cancelBtnText, { color: theme.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    // Клавиатуру обрабатывает корневой KeyboardAvoidingView в App.tsx
    <View style={{ flex: 1 }}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{t('entry.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('entry.subtitle')}
          </Text>
        </View>

        {/* Выбор счетчика */}
        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
          {t('entry.meterTypeLabel')}
        </Text>
        <View style={styles.meterGrid}>
          {meters.map(meter => {
            const isSelected = meter.id === selectedMeter.id;
            return (
              <TouchableOpacity
                key={meter.id}
                style={[
                  styles.meterTab,
                  {
                    backgroundColor: isSelected ? meter.color + '22' : theme.surfaceLight,
                    borderColor: isSelected ? meter.color : theme.border,
                  },
                ]}
                onPress={() => setSelectedMeterId(meter.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={getMeterIcon(meter.type) as any}
                  size={20}
                  color={isSelected ? meter.color : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.meterTabText,
                    {
                      color: isSelected ? meter.color : theme.text,
                      fontFamily: isSelected ? font.bold : font.medium,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {(() => {
                    const name = resolveMeterName(meter, t);
                    return name === getMeterTypeLabel(meter.type, t)
                      ? getMeterTypeShortLabel(meter.type, t)
                      : name;
                  })()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Первое показание: объясняем, что оно станет точкой отсчета */}
        {isFirstReading && (
          <View style={[styles.initialCard, { backgroundColor: theme.card, borderColor: theme.warning }]}>
            <View style={styles.initialHead}>
              <Ionicons name="flag-outline" size={18} color={theme.warning} />
              <Text style={[styles.initialTitle, { color: theme.text }]}>{t('entry.initialTitle')}</Text>
            </View>
            <Text style={[styles.initialText, { color: theme.textSecondary }]}>
              {t('entry.initialText')}
            </Text>
            <TouchableOpacity
              style={styles.warningRow}
              onPress={() => setSaveAsInitial(prev => !prev)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={saveAsInitial ? 'checkbox' : 'square-outline'}
                size={18}
                color={saveAsInitial ? theme.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.warningText,
                  { color: saveAsInitial ? theme.primary : theme.textSecondary },
                ]}
              >
                {t('entry.initialToggle')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Предыдущее показание */}
        {!isInitialMode && (
        <View style={[styles.prevBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.prevRow}>
            <View>
              <Text style={[styles.prevLabel, { color: theme.textSecondary }]}>
                {isReplacement
                  ? t('entry.replacedFromZero')
                  : prevReadingDate
                  ? t('entry.prevReading', { date: formatDate(prevReadingDate, t) })
                  : t('entry.prevNever')}
              </Text>
              <Text style={[styles.prevVal, { color: theme.text }]}>
                {formatNumber(prevReading)} {unit}
              </Text>
            </View>

            <View
              style={[
                styles.meterBadge,
                {
                  backgroundColor: selectedMeter.color + '20',
                  borderColor: selectedMeter.color + '40',
                },
              ]}
            >
              <Text style={[styles.meterBadgeText, { color: selectedMeter.color }]}>{unit}</Text>
            </View>
          </View>
        </View>

        )}

        {/* Новое показание */}
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('entry.newReadingLabel', { unit })}
          </Text>

          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: theme.inputBg,
                borderColor: isValidNum
                  ? isLowerThanPrev
                    ? theme.danger
                    : selectedMeter.color
                  : theme.inputBorder,
              },
              styles.bigInputWrap,
            ]}
          >
            <TextInput
              style={[styles.bigInput, { color: theme.text }]}
              placeholder={
                isInitialMode ? '0' : t('entry.readingPlaceholder', { value: prevReading + 10 })
              }
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={readingInput}
              onChangeText={setReadingInput}
            />
            <Text style={[styles.inputUnitSuffix, { color: theme.textSecondary }]}>{unit}</Text>
          </View>

          {isLowerThanPrev && (
            <View style={styles.warningRow}>
              <Ionicons name="warning" size={16} color={theme.danger} />
              <Text style={[styles.warningText, { color: theme.danger }]}>
                {t('entry.lowerThanPrev', { value: formatNumber(storedPrevReading) })}
              </Text>
            </View>
          )}

          {/* Переключатель замены счетчика */}
          {!isInitialMode && (
          <TouchableOpacity
            style={styles.warningRow}
            onPress={() => setIsReplacement(prev => !prev)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isReplacement ? 'checkbox' : 'square-outline'}
              size={18}
              color={isReplacement ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.warningText,
                { color: isReplacement ? theme.primary : theme.textSecondary },
              ]}
            >
              {t('entry.replacementCheckbox')}
            </Text>
          </TouchableOpacity>
          )}
        </View>

        {/* Предварительный расчет */}
        {!isInitialMode && isValidNum && numInput >= prevReading && (
          <View
            style={[
              styles.calcPreviewCard,
              { backgroundColor: theme.surfaceLight, borderColor: selectedMeter.color + '60' },
            ]}
          >
            <View style={styles.calcTopRow}>
              <View style={styles.calcIconTitle}>
                <Ionicons name="calculator" size={18} color={selectedMeter.color} />
                <Text style={[styles.calcTitle, { color: theme.text }]}>
                  {t('entry.calcTitle')}
                </Text>
              </View>
              <Text style={[styles.calcConsumptionBadge, { color: selectedMeter.color }]}>
                +{formatNumber(consumption)} {unit}
              </Text>
            </View>

            {/* Доля каждой ступени тарифа в расходе: сверх нормы — предупреждающими цветами */}
            {breakdown.isTiered && consumption > 0 && (
              <View style={[styles.tierBar, { backgroundColor: theme.border }]}>
                {breakdown.tiers.map((tier, idx) => (
                  <View
                    key={idx}
                    style={{
                      flex: tier.amount,
                      backgroundColor:
                        idx === 0 ? selectedMeter.color : idx === 1 ? theme.warning : theme.danger,
                    }}
                  />
                ))}
              </View>
            )}

            {/* Разбивка по ступеням тарифа */}
            <View style={styles.breakdownBox}>
              {breakdown.tiers.map((tier, idx) => (
                <View key={idx} style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                    {!breakdown.isTiered
                      ? t('entry.calcFlat', {
                          amount: formatNumber(tier.amount),
                          unit,
                          rate: formatCurrency(tier.rate, settings.currency),
                        })
                      : tier.to !== undefined
                      ? t('entry.calcTierUpTo', {
                          limit: formatNumber(tier.to),
                          unit,
                          amount: formatNumber(tier.amount),
                          rate: formatCurrency(tier.rate, settings.currency),
                        })
                      : t('entry.calcTierAbove', {
                          from: formatNumber(tier.from),
                          unit,
                          amount: formatNumber(tier.amount),
                          rate: formatCurrency(tier.rate, settings.currency),
                        })}
                  </Text>
                  <Text
                    style={[
                      styles.breakdownVal,
                      { color: idx === 0 ? theme.text : theme.warning },
                    ]}
                  >
                    {formatCurrency(tier.cost, settings.currency)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.calcTotalRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.calcTotalLabel, { color: theme.text }]}>
                {t('entry.calcTotal')}
              </Text>
              <Text style={[styles.calcTotalSum, { color: selectedMeter.color }]}>
                {formatCurrency(breakdown.totalCost, settings.currency)}
              </Text>
            </View>
          </View>
        )}

        {/* Дата снятия показания */}
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('entry.dateLabel')}
          </Text>
          <DateField value={dateInput} onChange={setDateInput} invalid={!isDateValid} />

          {!isDateValid && (
            <View style={styles.warningRow}>
              <Ionicons name="warning" size={16} color={theme.danger} />
              <Text style={[styles.warningText, { color: theme.danger }]}>
                {t('common.dateFormatHint', { example: getTodayDateKey() })}
              </Text>
            </View>
          )}
        </View>

        {/* Примечание и фото относятся к записи журнала, у начальной точки их нет */}
        {!isInitialMode && (
        <>
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            {t('entry.notesLabel')}
          </Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
            ]}
            placeholder={t('entry.notesPlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Фото счетчика */}
        <PhotoField
          label="entry.photoLabel"
          hint="entry.photoHint"
          fileName={photo}
          onChange={handlePhotoChange}
        />
        </>
        )}

        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: canSubmit ? selectedMeter.color : theme.surfaceLight,
              opacity: isSubmitting ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={isSubmitting || !canSubmit}
          activeOpacity={0.8}
        >
          <Ionicons
            name="checkmark-done"
            size={20}
            color={canSubmit ? ON_METER_COLOR : theme.textMuted}
          />
          <Text
            style={[styles.submitButtonText, { color: canSubmit ? ON_METER_COLOR : theme.textMuted }]}
          >
            {isSubmitting
              ? t('common.saving')
              : isInitialMode
              ? t('entry.initialSubmit')
              : t('entry.submit')}
          </Text>
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 6,
  },
  meterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  meterTab: {
    flexBasis: '22%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 4,
  },
  meterTabText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  initialCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  initialHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  initialTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  initialText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 18,
  },
  prevBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  prevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prevLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  prevVal: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
    marginTop: 2,
  },
  meterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  meterBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    height: 56,
  },
  bigInputWrap: {
    height: 68,
  },
  bigInput: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontFamily: font.extrabold,
    fontVariant: ['tabular-nums'],
  },
  inputUnitSuffix: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    marginLeft: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  warningText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  calcPreviewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  calcTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calcTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  calcConsumptionBadge: {
    fontSize: fontSize.md,
    fontFamily: font.extrabold,
  },
  tierBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  breakdownBox: {
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    flex: 1,
  },
  breakdownVal: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
    marginLeft: 6,
  },
  calcTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  calcTotalLabel: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  calcTotalSum: {
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlignVertical: 'top',
    height: 76,
  },
  submitButton: {
    ...button.lg,
    marginTop: 8,
  },
  submitButtonText: {
    ...buttonText.lg,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
});
