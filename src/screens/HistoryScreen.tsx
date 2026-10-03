import React, { useMemo, useState } from 'react';
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
import { MeterType, ReadingEntry } from '../types';
import { PaymentsSection } from './PaymentsSection';
import { PhotoField } from '../components/PhotoField';
import { getPhotoUri } from '../services/photos';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getMonthTitle,
  getCurrentMonthKey,
  getCostBreakdown,
  getMeterUnitLabel,
  isValidDateKey,
  generateTelegramReport,
  getTodayDateKey,
} from '../utils/calculator';
import {
  getMeterIcon,
  getMeterTypeLabel,
  getMeterTypeShortLabel,
  resolveMeterName,
} from '../utils/meters';
import { getTelegramLink } from '../utils/inspectors';
import { openInspectorLink } from '../components/InspectorsSection';
import { METER_TYPE_ORDER } from '../constants/defaults';
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
  const [selectedMeterType, setSelectedMeterType] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  const [editing, setEditing] = useState<ReadingEntry | null>(null);
  const [editReadingInput, setEditReadingInput] = useState('');
  const [editDateInput, setEditDateInput] = useState('');
  const [editNotesInput, setEditNotesInput] = useState('');
  const [editIsReplacement, setEditIsReplacement] = useState(false);
  const [editPhoto, setEditPhoto] = useState<string | undefined>(undefined);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    readings.forEach(r => set.add(r.date.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [readings]);

  const filteredReadings = useMemo(() => {
    return readings.filter(r => {
      const matchType = selectedMeterType === 'all' || r.meterType === selectedMeterType;
      const matchMonth = selectedMonth === 'all' || r.date.startsWith(selectedMonth);
      return matchType && matchMonth;
    });
  }, [readings, selectedMeterType, selectedMonth]);

  const filteredTotalCost = useMemo(
    () => filteredReadings.reduce((sum, r) => sum + r.cost, 0),
    [filteredReadings]
  );

  const handleCopyReport = async () => {
    const monthKey =
      selectedMonth === 'all' ? availableMonths[0] || getCurrentMonthKey() : selectedMonth;

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

  const meterTabs: { id: string; label: string; icon: string }[] = [
    { id: 'all', label: t('common.all'), icon: 'apps-outline' },
    ...METER_TYPE_ORDER.map(type => ({
      id: type,
      label: getMeterTypeShortLabel(type, t),
      icon: getMeterIcon(type),
    })),
  ];

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
        <>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]}>{t('history.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {t('history.subtitle')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: theme.primary }]}
              onPress={onOpenReports ?? handleCopyReport}
              activeOpacity={0.8}
            >
              <Ionicons name="document-text-outline" size={16} color={theme.onPrimary} />
              <Text style={[styles.shareBtnText, { color: theme.onPrimary }]}>{t('history.reportBtn')}</Text>
            </TouchableOpacity>
          </View>

          {/* Фильтр по периоду */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: selectedMonth === 'all' ? theme.primary : theme.surfaceLight,
                  borderColor: selectedMonth === 'all' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedMonth('all')}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selectedMonth === 'all' ? theme.onPrimary : theme.textSecondary },
                ]}
              >
                {t('history.allPeriods')}
              </Text>
            </TouchableOpacity>

            {availableMonths.map(monthKey => (
              <TouchableOpacity
                key={monthKey}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      selectedMonth === monthKey ? theme.primary : theme.surfaceLight,
                    borderColor: selectedMonth === monthKey ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setSelectedMonth(monthKey)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selectedMonth === monthKey ? theme.onPrimary : theme.textSecondary },
                  ]}
                >
                  {getMonthTitle(monthKey, t)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Фильтр по ресурсу */}
          <View style={styles.meterFilterRow}>
            {meterTabs.map(tab => {
              const isSelected = selectedMeterType === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.meterTab,
                    {
                      backgroundColor: isSelected ? theme.primary + '20' : theme.card,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedMeterType(tab.id)}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={14}
                    color={isSelected ? theme.primary : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.meterTabText,
                      {
                        color: isSelected ? theme.primary : theme.textSecondary,
                        fontFamily: isSelected ? font.bold : font.medium,
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Итог по фильтру */}
          <View
            style={[
              styles.filterSummaryCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View>
              <Text style={[styles.filterSummaryLabel, { color: theme.textSecondary }]}>
                {t('history.foundCount', { count: filteredReadings.length })}
              </Text>
              <Text style={[styles.filterSummaryCost, { color: theme.text }]}>
                {formatCurrency(filteredTotalCost, settings.currency)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.telegramBtn, { backgroundColor: '#229ED9' }]}
              onPress={handleCopyReport}
              activeOpacity={0.8}
            >
              <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
              <Text style={styles.telegramBtnText}>{t('history.forInspector')}</Text>
            </TouchableOpacity>
          </View>

          {/* Список показаний */}
          {filteredReadings.length === 0 ? (
            <View
              style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('history.emptyTitle')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {t('history.emptyText')}
              </Text>
            </View>
          ) : (
            <View style={styles.readingsList}>
              {filteredReadings.map(r => {
                const meter = meters.find(m => m.id === r.meterId);
                const unit = getMeterUnitLabel(r.meterType as MeterType, t);
                const photoUri = getPhotoUri(r.photo);

                return (
                  <View
                    key={r.id}
                    style={[
                      styles.readingCard,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View
                          style={[
                            styles.meterIconBox,
                            { backgroundColor: (meter?.color || theme.primary) + '22' },
                          ]}
                        >
                          <Ionicons
                            name={getMeterIcon(r.meterType) as any}
                            size={18}
                            color={meter?.color || theme.primary}
                          />
                        </View>
                        <View>
                          <Text style={[styles.meterTitle, { color: theme.text }]}>
                            {meter ? resolveMeterName(meter, t) : r.meterType}
                          </Text>
                          <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
                            {formatDate(r.date, t)}
                            {r.isReplacement ? ` • ${t('history.replacedBadge')}` : ''}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardActions}>
                        {photoUri && (
                          <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => setPreviewPhoto(photoUri)}
                            activeOpacity={0.7}
                          >
                            <Image
                              source={{ uri: photoUri }}
                              style={[styles.photoThumb, { borderColor: theme.border }]}
                            />
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleOpenEdit(r)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="create-outline" size={18} color={theme.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDelete(r)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color={theme.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.cardBody, { backgroundColor: theme.surfaceLight }]}>
                      <View style={styles.readingsGrid}>
                        <View style={styles.gridItem}>
                          <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>
                            {t('history.was')}
                          </Text>
                          <Text style={[styles.gridValue, { color: theme.text }]}>
                            {formatNumber(r.previousReading)} {unit}
                          </Text>
                        </View>

                        <Ionicons name="arrow-forward" size={16} color={theme.textMuted} />

                        <View style={styles.gridItem}>
                          <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>
                            {t('history.became')}
                          </Text>
                          <Text
                            style={[styles.gridValue, { color: theme.text, fontFamily: font.extrabold }]}
                          >
                            {formatNumber(r.reading)} {unit}
                          </Text>
                        </View>

                        <View style={styles.gridItemRight}>
                          <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>
                            {t('history.consumption')}
                          </Text>
                          <Text
                            style={[
                              styles.consumptionHighlight,
                              { color: meter?.color || theme.primary },
                            ]}
                          >
                            +{formatNumber(r.consumption)} {unit}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      {r.notes ? (
                        <View style={styles.notesWrap}>
                          <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={14}
                            color={theme.textMuted}
                          />
                          <Text
                            style={[styles.notesText, { color: theme.textSecondary }]}
                            numberOfLines={1}
                          >
                            {r.notes}
                          </Text>
                        </View>
                      ) : (
                        <View />
                      )}

                      <View style={styles.costBadge}>
                        <Text style={[styles.costLabel, { color: theme.textSecondary }]}>
                          {t('history.toPay')}
                        </Text>
                        <Text style={[styles.costText, { color: theme.text }]}>
                          {formatCurrency(r.cost, settings.currency)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginTop: 2,
  },
  shareBtn: {
    ...button.sm,
  },
  shareBtnText: {
    ...buttonText.sm,
  },
  chipRow: {
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  meterFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  meterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  meterTabText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  filterSummaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  filterSummaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  filterSummaryCost: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
    marginTop: 2,
  },
  telegramBtn: {
    ...button.sm,
  },
  telegramBtnText: {
    ...buttonText.sm,
    color: '#FFFFFF',
  },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 19,
  },
  readingsList: {
    gap: 12,
  },
  readingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  meterIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  cardDate: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    padding: 5,
  },
  photoThumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardBody: {
    borderRadius: 12,
    padding: 12,
  },
  readingsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridItem: {
    flexShrink: 1,
  },
  gridItemRight: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  gridLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  gridValue: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    marginTop: 2,
  },
  consumptionHighlight: {
    fontSize: fontSize.sm,
    fontFamily: font.extrabold,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  notesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  notesText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    flex: 1,
  },
  costBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  costLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  costText: {
    fontSize: fontSize.sm,
    fontFamily: font.extrabold,
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
