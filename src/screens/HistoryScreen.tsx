import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../context/AppContext';
import { ReadingEntry } from '../types';
import { PaymentsSection } from './PaymentsSection';
import { ReadingsTimeline } from './history/ReadingsTimeline';
import { PhotoField } from '../components/PhotoField';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getCostBreakdown,
  getMeterUnitLabel,
  isValidDateKey,
  generateTelegramReport,
  getTodayDateKey,
} from '../utils/calculator';
import { getMeterTypeLabel, resolveMeterName } from '../utils/meters';
import { getTelegramLink } from '../utils/inspectors';
import { openInspectorLink } from '../components/InspectorsSection';
import { font, fontSize, button, buttonText } from '../constants/theme';
import { appAlert, appError, appSuccess } from '../components/AppDialog';
import { KeyboardOverlay } from '../components/KeyboardOverlay';
import { DateField } from '../components/DateField';
import { AppModal } from '../components/AppModal';

type HistoryTab = 'readings' | 'payments';

interface HistoryScreenProps {
  onOpenReports?: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ onOpenReports }) => {
  const {
    theme,
    readings,
    payments,
    inspectors,
    meters,
    tariffs,
    settings,
    activeProperty,
    deleteReading,
    updateReading,
    t,
  } = useApp();

  const [activeTab, setActiveTab] = useState<HistoryTab>('readings');

  const [editing, setEditing] = useState<ReadingEntry | null>(null);
  const [editReadingInput, setEditReadingInput] = useState('');
  const [editDateInput, setEditDateInput] = useState('');
  const [editNotesInput, setEditNotesInput] = useState('');
  const [editIsReplacement, setEditIsReplacement] = useState(false);
  const [editPhoto, setEditPhoto] = useState<string | undefined>(undefined);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const handleCopyReport = async (monthKey: string) => {

    const reportText = generateTelegramReport({
      monthKey,
      propertyName: activeProperty.name,
      readings,
      payments,
      currency: settings.currency,
      t,
    });

    await Clipboard.setStringAsync(reportText);

    // Если у инспекторов указан Telegram — сразу предлагаем открыть их чат
    const reachable = inspectors
      .map(inspector => ({ inspector, link: getTelegramLink(inspector) }))
      .filter((item): item is { inspector: typeof item.inspector; link: string } => !!item.link);

    if (reachable.length === 0) {
      appSuccess(t('history.reportCopiedTitle'), t('history.reportCopiedText'));
      return;
    }

    appSuccess(t('history.reportCopiedTitle'), t('history.reportPickInspector'), [
      ...reachable.map(({ inspector, link }) => ({
        text: t('history.openInspectorChat', {
          type: getMeterTypeLabel(inspector.meterType, t),
        }),
        onPress: () => openInspectorLink(link, t('inspectors.openFailed'), t('common.error')),
      })),
      { text: t('common.close'), style: 'cancel' as const },
    ]);
  };

  const handleOpenEdit = (reading: ReadingEntry) => {
    setEditing(reading);
    setEditReadingInput(String(reading.reading));
    setEditDateInput(reading.date);
    setEditNotesInput(reading.notes || '');
    setEditIsReplacement(!!reading.isReplacement);
    setEditPhoto(reading.photo);
  };

  const editedReading = parseFloat(editReadingInput.replace(',', '.'));
  const isEditReadingValid = !isNaN(editedReading) && editedReading >= 0;
  const isEditDateValid = isValidDateKey(editDateInput);
  // «Было» не меняется: правка не должна сдвигать границу предыдущего периода
  const editPrevReading = editIsReplacement ? 0 : editing?.previousReading ?? 0;
  const editConsumption = isEditReadingValid ? Math.max(0, editedReading - editPrevReading) : 0;
  const editCost = editing
    ? getCostBreakdown(editConsumption, tariffs.find(item => item.meterType === editing.meterType))
        .totalCost
    : 0;

  const handleSaveEdit = async () => {
    if (!editing) return;

    if (!isEditReadingValid) {
      appError(t('entry.invalidNumberTitle'), t('entry.invalidNumberText'));
      return;
    }
    if (!isEditDateValid) {
      appError(
        t('entry.invalidDateTitle'),
        t('common.dateFormatHint', { example: getTodayDateKey() })
      );
      return;
    }

    await updateReading(editing.id, {
      reading: editedReading,
      date: editDateInput,
      notes: editNotesInput.trim(),
      isReplacement: editIsReplacement,
      photo: editPhoto ?? null,
    });
    setEditing(null);
  };

  const handleDelete = (reading: ReadingEntry) => {
    const meter = meters.find(m => m.id === reading.meterId);
    appAlert(
      t('history.deleteTitle'),
      t('history.deleteText', {
        value: formatNumber(reading.reading),
        unit: meter ? getMeterUnitLabel(meter.type, t) : '',
        date: formatDate(reading.date, t),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteReading(reading.id),
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Переключатель: показания / платежи */}
      <View
        style={[styles.segmented, { backgroundColor: theme.surfaceLight, borderColor: theme.border }]}
      >
        {(['readings', 'payments'] as HistoryTab[]).map(tab => {
          const isSelected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.segmentedItem, isSelected && { backgroundColor: theme.primary }]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tab === 'readings' ? 'receipt-outline' : 'wallet-outline'}
                size={16}
                color={isSelected ? theme.onPrimary : theme.textSecondary}
              />
              <Text
                style={[
                  styles.segmentedText,
                  { color: isSelected ? theme.onPrimary : theme.textSecondary },
                ]}
              >
                {tab === 'readings' ? t('history.tabReadings') : t('history.tabPayments')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'payments' ? (
        <PaymentsSection />
      ) : (
        <ReadingsTimeline
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onPreviewPhoto={setPreviewPhoto}
          onSendMonth={handleCopyReport}
          onOpenReports={onOpenReports}
        />
      )}

      {/* Правка показания */}
      <AppModal
        visible={!!editing}
        variant="sheet"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t('history.editTitle')}
              </Text>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {editing && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                  {t('history.editSubtitle', {
                    meter: (() => {
                      const meter = meters.find(m => m.id === editing.meterId);
                      return meter ? resolveMeterName(meter, t) : editing.meterType;
                    })(),
                    prev: formatNumber(editPrevReading),
                  })}
                </Text>

                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                  {t('history.editReadingLabel')}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: isEditReadingValid ? theme.inputBorder : theme.danger,
                      color: theme.text,
                    },
                  ]}
                  value={editReadingInput}
                  onChangeText={setEditReadingInput}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholderTextColor={theme.textMuted}
                />

                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                  {t('history.editDateLabel')}
                </Text>
                <DateField
                  value={editDateInput}
                  onChange={setEditDateInput}
                  invalid={!isEditDateValid}
                />

                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                  {t('history.editNotesLabel')}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      color: theme.text,
                    },
                  ]}
                  value={editNotesInput}
                  onChangeText={setEditNotesInput}
                  placeholder={t('history.editNotesPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                />

                <TouchableOpacity
                  style={styles.replacementRow}
                  onPress={() => setEditIsReplacement(prev => !prev)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={editIsReplacement ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={editIsReplacement ? theme.primary : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.replacementText,
                      { color: editIsReplacement ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    {t('history.editReplacement')}
                  </Text>
                </TouchableOpacity>

                <View style={{ marginTop: 16 }}>
                  <PhotoField
                    label="entry.photoLabel"
                    hint="entry.photoHint"
                    fileName={editPhoto}
                    onChange={fileName => setEditPhoto(fileName || undefined)}
                  />
                </View>

                <View style={[styles.editPreview, { backgroundColor: theme.surfaceLight }]}>
                  <Text style={[styles.editPreviewLabel, { color: theme.textSecondary }]}>
                    {t('history.editNewConsumption', { value: formatNumber(editConsumption) })}
                  </Text>
                  <Text style={[styles.editPreviewCost, { color: theme.text }]}>
                    {formatCurrency(editCost, settings.currency)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveModalBtn,
                    {
                      backgroundColor:
                        isEditReadingValid && isEditDateValid ? theme.primary : theme.surfaceLight,
                    },
                  ]}
                  onPress={handleSaveEdit}
                  disabled={!isEditReadingValid || !isEditDateValid}
                >
                  <Text
                    style={[
                      styles.saveModalBtnText,
                      {
                        color: isEditReadingValid && isEditDateValid ? theme.onPrimary : theme.textMuted,
                      },
                    ]}
                  >
                    {t('history.editSave')}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardOverlay>
      </AppModal>

      {/* Просмотр фото счетчика */}
      <Modal
        visible={!!previewPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <TouchableOpacity
          style={styles.photoOverlay}
          activeOpacity={1}
          onPress={() => setPreviewPhoto(null)}
        >
          {previewPhoto && (
            <Image source={{ uri: previewPhoto }} style={styles.fullPhoto} resizeMode="contain" />
          )}
          <View style={[styles.closeHint, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text }}>{t('common.close')}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 16,
  },
  segmentedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 12,
  },
  segmentedText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  modalSub: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginBottom: 6,
  },
  modalLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 50,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  replacementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  replacementText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    flex: 1,
  },
  editPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  editPreviewLabel: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  editPreviewCost: {
    fontSize: fontSize.md,
    fontFamily: font.extrabold,
  },
  saveModalBtn: {
    ...button.lg,
    marginTop: 18,
    marginBottom: 8,
  },
  saveModalBtnText: {
    ...buttonText.lg,
  },
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fullPhoto: {
    width: '100%',
    height: '80%',
  },
  closeHint: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
