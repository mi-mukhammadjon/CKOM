import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import {
  formatDate,
  getMeterUnitLabel,
  getTodayDateKey,
  isValidDateKey,
} from '../utils/calculator';
import { getMeterIcon, hasReadingHistory, resolveMeterName } from '../utils/meters';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { appError, appSuccess } from './AppDialog';
import { DateField } from './DateField';
import { AppModal } from './AppModal';

interface InitialReadingsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Ввод начальных показаний сразу для всех счетчиков объекта, по которым еще
 * нет записей. От этих цифр считается расход первого месяца.
 */
export const InitialReadingsModal: React.FC<InitialReadingsModalProps> = ({ visible, onClose }) => {
  const { theme, meters, readings, setInitialReadings, t } = useApp();

  const editableMeters = meters.filter(m => !hasReadingHistory(m.id, readings));

  const [values, setValues] = useState<Record<string, string>>({});
  const [dateInput, setDateInput] = useState(getTodayDateKey);
  const [isSaving, setIsSaving] = useState(false);

  // При каждом открытии подставляем уже заданные начальные цифры
  useEffect(() => {
    if (!visible) return;
    const initial: Record<string, string> = {};
    editableMeters.forEach(m => {
      initial[m.id] = m.lastReadingDate ? String(m.currentReading) : '';
    });
    setValues(initial);
    setDateInput(getTodayDateKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDateValid = isValidDateKey(dateInput);

  const handleSave = async () => {
    const entries: { meterId: string; reading: number }[] = [];
    for (const meter of editableMeters) {
      const raw = (values[meter.id] ?? '').trim();
      if (!raw) continue;
      const reading = parseFloat(raw.replace(',', '.'));
      if (isNaN(reading) || reading < 0) {
        appError(t('common.error'), t('initial.invalidValue', { name: resolveMeterName(meter, t) }));
        return;
      }
      entries.push({ meterId: meter.id, reading });
    }

    if (entries.length === 0) {
      appError(t('common.error'), t('initial.emptyValues'));
      return;
    }
    if (!isDateValid) {
      appError(t('entry.invalidDateTitle'), t('common.dateFormatHint', { example: getTodayDateKey() }));
      return;
    }

    try {
      setIsSaving(true);
      await setInitialReadings(entries, dateInput);
      onClose();
      appSuccess(t('initial.savedTitle'), t('initial.savedText'));
    } catch {
      appError(t('common.error'), t('entry.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      variant="sheet"
      onRequestClose={onClose}
    >
      {/* padding на всех платформах: KeyboardAvoidingView сам вычислит перекрытие клавиатурой */}
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.borderLight }]} />

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>{t('initial.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {t('initial.subtitle')}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.surfaceLight }]}
              onPress={onClose}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {editableMeters.map(meter => {
              const unit = getMeterUnitLabel(meter.type, t);
              return (
                <View
                  key={meter.id}
                  style={[styles.row, { backgroundColor: theme.surfaceLight }]}
                >
                  <View style={[styles.iconBox, { backgroundColor: meter.color + '24' }]}>
                    <Ionicons name={getMeterIcon(meter.type) as any} size={18} color={meter.color} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.meterName, { color: theme.text }]} numberOfLines={1}>
                      {resolveMeterName(meter, t)}
                    </Text>
                    {meter.lastReadingDate ? (
                      <Text style={[styles.meterHint, { color: theme.textMuted }]}>
                        {t('initial.alreadySet', { date: formatDate(meter.lastReadingDate, t) })}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.inputWrap,
                      { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                    ]}
                  >
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={values[meter.id] ?? ''}
                      onChangeText={text => setValues(prev => ({ ...prev, [meter.id]: text }))}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="0"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.unit, { color: theme.textMuted }]}>{unit}</Text>
                  </View>
                </View>
              );
            })}

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t('initial.dateLabel')}
            </Text>
            <DateField value={dateInput} onChange={setDateInput} invalid={!isDateValid} />
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={20} color={theme.onPrimary} />
            <Text style={[styles.saveText, { color: theme.onPrimary }]}>
              {isSaving ? t('common.saving') : t('initial.save')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    flexShrink: 1,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 14,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
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
  closeBtn: {
    ...button.icon,
  },
  // Список сжимается, когда клавиатура забирает место, и прокручивается
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  meterName: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  meterHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  inputWrap: {
    width: 140,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    fontFamily: font.bold,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginTop: 6,
  },
  saveBtn: {
    ...button.lg,
  },
  saveText: {
    ...buttonText.lg,
  },
});
