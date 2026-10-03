import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Tariff } from '../types';
import { formatCurrency, formatNumber, getMeterUnitLabel } from '../utils/calculator';
import { getMeterColor, getMeterIcon, getMeterTypeLabel } from '../utils/meters';
import { font, fontSize, button, buttonText } from '../constants/theme';
import { appAlert, appError, appSuccess } from '../components/AppDialog';
import { KeyboardOverlay } from '../components/KeyboardOverlay';
import { AppModal } from '../components/AppModal';

export const TariffsScreen: React.FC = () => {
  const { theme, tariffs, updateTariff, resetTariffs, settings, t } = useApp();

  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null);
  const [baseRateInput, setBaseRateInput] = useState<string>('');
  const [isTiered, setIsTiered] = useState<boolean>(false);
  const [tierLimitInput, setTierLimitInput] = useState<string>('');
  const [tierRateInput, setTierRateInput] = useState<string>('');
  const [hasThirdTier, setHasThirdTier] = useState<boolean>(false);
  const [secondLimitInput, setSecondLimitInput] = useState<string>('');
  const [secondRateInput, setSecondRateInput] = useState<string>('');

  const editingUnit = editingTariff ? getMeterUnitLabel(editingTariff.meterType, t) : '';

  const handleOpenEdit = (tariff: Tariff) => {
    setEditingTariff(tariff);
    setBaseRateInput(tariff.baseRate.toString());
    setIsTiered(tariff.pricingType === 'tiered');
    setTierLimitInput((tariff.tierLimit || 200).toString());
    setTierRateInput((tariff.tierRate || tariff.baseRate * 2).toString());
    setHasThirdTier(!!(tariff.secondaryLimit && tariff.secondaryRate));
    setSecondLimitInput((tariff.secondaryLimit || (tariff.tierLimit || 200) * 2).toString());
    setSecondRateInput((tariff.secondaryRate || (tariff.tierRate || tariff.baseRate * 2) * 2).toString());
  };

  const handleSaveTariff = async () => {
    if (!editingTariff) return;

    const baseRate = parseFloat(baseRateInput.replace(',', '.'));
    if (isNaN(baseRate) || baseRate <= 0) {
      appError(t('common.error'), t('tariffs.invalidBaseRate'));
      return;
    }

    let tierLimit: number | undefined;
    let tierRate: number | undefined;
    let secondaryLimit: number | undefined;
    let secondaryRate: number | undefined;

    if (isTiered) {
      tierLimit = parseFloat(tierLimitInput.replace(',', '.'));
      tierRate = parseFloat(tierRateInput.replace(',', '.'));
      if (isNaN(tierLimit) || isNaN(tierRate) || tierLimit <= 0 || tierRate <= 0) {
        appError(t('common.error'), t('tariffs.invalidTier'));
        return;
      }

      if (hasThirdTier) {
        secondaryLimit = parseFloat(secondLimitInput.replace(',', '.'));
        secondaryRate = parseFloat(secondRateInput.replace(',', '.'));
        if (isNaN(secondaryLimit) || isNaN(secondaryRate) || secondaryRate <= 0) {
          appError(t('common.error'), t('tariffs.invalidThirdTier'));
          return;
        }
        if (secondaryLimit <= tierLimit) {
          appError(
            t('common.error'),
            t('tariffs.secondLimitTooSmall', { second: secondaryLimit, first: tierLimit })
          );
          return;
        }
      }
    }

    const title = getMeterTypeLabel(editingTariff.meterType, t);
    await updateTariff({
      ...editingTariff,
      baseRate,
      pricingType: isTiered ? 'tiered' : 'flat',
      tierLimit,
      tierRate,
      secondaryLimit,
      secondaryRate,
    });
    setEditingTariff(null);
    appSuccess(t('common.success'), t('tariffs.savedText', { title }));
  };

  const handleResetToStandard = () => {
    appAlert(t('tariffs.resetTitle'), t('tariffs.resetText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tariffs.resetConfirm'),
        onPress: async () => {
          await resetTariffs();
          appSuccess(t('common.success'), t('tariffs.resetDone'));
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>{t('tariffs.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('tariffs.subtitle')}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.resetBtn, { backgroundColor: theme.surfaceLight }]}
          onPress={handleResetToStandard}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.infoBanner, { backgroundColor: theme.badgeBg, borderColor: theme.primary + '40' }]}>
        <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
        <Text style={[styles.infoBannerText, { color: theme.text }]}>{t('tariffs.infoBanner')}</Text>
      </View>

      <View style={styles.tariffList}>
        {tariffs.map(tariff => {
          const color = getMeterColor(tariff.meterType);
          const unit = getMeterUnitLabel(tariff.meterType, t);
          const isTier = tariff.pricingType === 'tiered' && !!tariff.tierLimit && !!tariff.tierRate;
          const hasThird =
            isTier &&
            !!tariff.secondaryLimit &&
            !!tariff.secondaryRate &&
            tariff.secondaryLimit > tariff.tierLimit!;

          return (
            <View
              key={tariff.id}
              style={[styles.tariffCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}>
                  <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
                    <Ionicons name={getMeterIcon(tariff.meterType) as any} size={20} color={color} />
                  </View>
                  <View style={styles.cardTitleText}>
                    <Text style={[styles.tariffTitle, { color: theme.text }]}>
                      {getMeterTypeLabel(tariff.meterType, t)}
                    </Text>
                    <Text
                      style={[styles.tariffTypeBadge, { color: isTier ? theme.warning : theme.success }]}
                    >
                      {isTier ? t('tariffs.tieredBadge') : t('tariffs.flatBadge')}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.editButton, { backgroundColor: theme.surfaceLight }]}
                  onPress={() => handleOpenEdit(tariff)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={16} color={theme.primary} />
                  <Text style={[styles.editButtonText, { color: theme.primary }]}>
                    {t('common.edit')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.ratesContainer, { backgroundColor: theme.surfaceLight }]}>
                {isTier ? (
                  <>
                    <View style={styles.rateRow}>
                      <Text style={[styles.rateRowLabel, { color: theme.textSecondary }]}>
                        {t('tariffs.baseVolume', { limit: formatNumber(tariff.tierLimit || 0), unit })}
                      </Text>
                      <Text style={[styles.rateRowValue, { color: theme.text }]}>
                        {formatCurrency(tariff.baseRate, settings.currency)} / {unit}
                      </Text>
                    </View>

                    <View style={styles.rateRow}>
                      <Text style={[styles.rateRowLabel, { color: theme.textSecondary }]}>
                        {hasThird
                          ? t('tariffs.secondTier', {
                              from: formatNumber(tariff.tierLimit || 0),
                              to: formatNumber(tariff.secondaryLimit || 0),
                              unit,
                            })
                          : t('tariffs.aboveNorm', {
                              limit: formatNumber(tariff.tierLimit || 0),
                              unit,
                            })}
                      </Text>
                      <Text style={[styles.rateRowValue, { color: theme.warning }]}>
                        {formatCurrency(tariff.tierRate || 0, settings.currency)} / {unit}
                      </Text>
                    </View>

                    {hasThird && (
                      <View style={styles.rateRow}>
                        <Text style={[styles.rateRowLabel, { color: theme.textSecondary }]}>
                          {t('tariffs.thirdTier', {
                            limit: formatNumber(tariff.secondaryLimit || 0),
                            unit,
                          })}
                        </Text>
                        <Text style={[styles.rateRowValue, { color: theme.danger }]}>
                          {formatCurrency(tariff.secondaryRate || 0, settings.currency)} / {unit}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.rateRow}>
                    <Text style={[styles.rateRowLabel, { color: theme.textSecondary }]}>
                      {t('tariffs.flatPrice', { unit })}
                    </Text>
                    <Text style={[styles.rateRowValue, { color: theme.text }]}>
                      {formatCurrency(tariff.baseRate, settings.currency)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Редактирование тарифа */}
      <AppModal
        visible={!!editingTariff}
        variant="sheet"
        onRequestClose={() => setEditingTariff(null)}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t('tariffs.editTitle', {
                  title: editingTariff ? getMeterTypeLabel(editingTariff.meterType, t) : '',
                })}
              </Text>
              <TouchableOpacity onPress={() => setEditingTariff(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                  {t('tariffs.baseRateLabel', { unit: editingUnit, currency: settings.currency })}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                  ]}
                  value={baseRateInput}
                  onChangeText={setBaseRateInput}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="450"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={[styles.switchRow, { borderColor: theme.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchLabel, { color: theme.text }]}>
                    {t('tariffs.tieredSwitch')}
                  </Text>
                  <Text style={[styles.switchSub, { color: theme.textSecondary }]}>
                    {t('tariffs.tieredSwitchSub')}
                  </Text>
                </View>
                <Switch
                  value={isTiered}
                  onValueChange={setIsTiered}
                  trackColor={{ false: theme.border, true: theme.primary }}
                />
              </View>

              {isTiered && (
                <View style={styles.tierSection}>
                  <View style={styles.modalInputGroup}>
                    <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                      {t('tariffs.tierLimitLabel', { unit: editingUnit })}
                    </Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                      ]}
                      value={tierLimitInput}
                      onChangeText={setTierLimitInput}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="200"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                      {t('tariffs.tierRateLabel', { currency: settings.currency, unit: editingUnit })}
                    </Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                      ]}
                      value={tierRateInput}
                      onChangeText={setTierRateInput}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="900"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.switchRow, { borderColor: theme.borderLight }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.switchLabel, { color: theme.text }]}>
                        {t('tariffs.thirdTierSwitch')}
                      </Text>
                      <Text style={[styles.switchSub, { color: theme.textSecondary }]}>
                        {t('tariffs.thirdTierSwitchSub')}
                      </Text>
                    </View>
                    <Switch
                      value={hasThirdTier}
                      onValueChange={setHasThirdTier}
                      trackColor={{ false: theme.border, true: theme.primary }}
                    />
                  </View>

                  {hasThirdTier && (
                    <>
                      <View style={styles.modalInputGroup}>
                        <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                          {t('tariffs.secondLimitLabel', { unit: editingUnit })}
                        </Text>
                        <TextInput
                          style={[
                            styles.modalInput,
                            { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                          ]}
                          value={secondLimitInput}
                          onChangeText={setSecondLimitInput}
                          keyboardType="decimal-pad"
                          inputMode="decimal"
                          placeholder="500"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>

                      <View style={styles.modalInputGroup}>
                        <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                          {t('tariffs.secondRateLabel', {
                            currency: settings.currency,
                            unit: editingUnit,
                          })}
                        </Text>
                        <TextInput
                          style={[
                            styles.modalInput,
                            { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                          ]}
                          value={secondRateInput}
                          onChangeText={setSecondRateInput}
                          keyboardType="decimal-pad"
                          inputMode="decimal"
                          placeholder="1800"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>
                    </>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveTariff}
              >
                <Text style={[styles.saveModalBtnText, { color: theme.onPrimary }]}>{t('tariffs.saveBtn')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardOverlay>
      </AppModal>

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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  // Заголовок занимает оставшееся место и переносится, не выталкивая кнопку за экран
  headerText: {
    flex: 1,
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
  resetBtn: {
    ...button.icon,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 18,
    flex: 1,
  },
  tariffList: {
    gap: 14,
  },
  tariffCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitleText: {
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tariffTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  tariffTypeBadge: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    marginTop: 2,
  },
  editButton: {
    ...button.sm,
  },
  editButtonText: {
    ...buttonText.sm,
  },
  ratesContainer: {
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  rateRowLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    lineHeight: 20,
  },
  rateRowValue: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
    lineHeight: 20,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  modalInputGroup: {
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalInput: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginVertical: 10,
  },
  switchLabel: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  switchSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  tierSection: {
    marginTop: 10,
  },
  saveModalBtn: {
    ...button.lg,
    marginTop: 18,
    marginBottom: 20,
  },
  saveModalBtnText: {
    ...buttonText.lg,
  },
});
