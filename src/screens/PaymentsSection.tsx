import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { MeterType, Payment, PaymentMethod } from '../types';
import { PhotoField } from '../components/PhotoField';
import { deletePhoto } from '../services/photos';
import {
  calculateMonthBalance,
  formatCurrency,
  formatDate,
  getCurrentMonthKey,
  getMonthTitle,
  getRecentMonthKeys,
  getTodayDateKey,
  isValidDateKey,
} from '../utils/calculator';
import {
  getMeterColor,
  getMeterIcon,
  getMeterTypeLabel,
  getPaymentMethodLabel,
} from '../utils/meters';
import {
  PAYMENT_METHOD_ICONS,
  PAYMENT_METHOD_ORDER,
  METER_TYPE_ORDER,
} from '../constants/defaults';
import { font, fontSize, button, buttonText } from '../constants/theme';
import { appAlert, appError } from '../components/AppDialog';
import { KeyboardOverlay } from '../components/KeyboardOverlay';
import { DateField } from '../components/DateField';
import { AppModal } from '../components/AppModal';

interface FormState {
  amount: string;
  monthKey: string;
  date: string;
  method: PaymentMethod;
  meterType?: MeterType;
  notes: string;
  receiptPhoto?: string;
}

function emptyForm(monthKey: string): FormState {
  return {
    amount: '',
    monthKey,
    date: getTodayDateKey(),
    method: 'cash',
    meterType: undefined,
    notes: '',
    receiptPhoto: undefined,
  };
}

export const PaymentsSection: React.FC = () => {
  const { theme, t, settings, readings, payments, balances, addPayment, updatePayment, deletePayment } =
    useApp();

  const currentMonthKey = getCurrentMonthKey();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(currentMonthKey));

  /** Периоды для фильтра: последние 6 месяцев плюс все, по которым есть данные */
  const monthOptions = useMemo(() => {
    const keys = new Set<string>([...getRecentMonthKeys(6), ...balances.map(b => b.monthKey)]);
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [balances]);

  const balance = calculateMonthBalance(selectedMonth, readings, payments);
  const monthPayments = payments.filter(p => p.monthKey === selectedMonth);

  const openCreate = () => {
    const draft = emptyForm(selectedMonth);
    // Подставляем остаток долга: чаще всего платят ровно его
    if (balance.due > 0) draft.amount = String(balance.due);
    setForm(draft);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (payment: Payment) => {
    setForm({
      amount: String(payment.amount),
      monthKey: payment.monthKey,
      date: payment.date,
      method: payment.method,
      meterType: payment.meterType,
      notes: payment.notes || '',
      receiptPhoto: payment.receiptPhoto,
    });
    setEditingId(payment.id);
    setFormOpen(true);
  };

  const closeForm = () => {
    // Снимок, добавленный в незавершенной форме, в хранилище не нужен
    const original = editingId ? payments.find(p => p.id === editingId) : undefined;
    if (form.receiptPhoto && form.receiptPhoto !== original?.receiptPhoto) {
      deletePhoto(form.receiptPhoto);
    }
    setFormOpen(false);
    setEditingId(null);
  };

  const handlePhotoChange = (fileName: string | null) => {
    const original = editingId ? payments.find(p => p.id === editingId) : undefined;
    if (form.receiptPhoto && form.receiptPhoto !== fileName && form.receiptPhoto !== original?.receiptPhoto) {
      deletePhoto(form.receiptPhoto);
    }
    setForm(prev => ({ ...prev, receiptPhoto: fileName || undefined }));
  };

  const amountValue = parseFloat(form.amount.replace(',', '.'));
  const isAmountValid = !isNaN(amountValue) && amountValue > 0;
  const isDateValid = isValidDateKey(form.date);

  const handleSubmit = async () => {
    if (!isAmountValid) {
      appError(t('common.error'), t('payments.invalidAmount'));
      return;
    }
    if (!isDateValid) {
      appError(
        t('entry.invalidDateTitle'),
        t('common.dateFormatHint', { example: getTodayDateKey() })
      );
      return;
    }

    const input = {
      monthKey: form.monthKey,
      amount: amountValue,
      date: form.date,
      method: form.method,
      meterType: form.meterType,
      notes: form.notes.trim() || undefined,
      receiptPhoto: form.receiptPhoto ?? null,
    };

    if (editingId) {
      await updatePayment(editingId, input);
    } else {
      await addPayment(input);
    }

    setSelectedMonth(form.monthKey);
    setFormOpen(false);
    setEditingId(null);
  };

  const handleDelete = (payment: Payment) => {
    appAlert(
      t('payments.deleteTitle'),
      t('payments.deleteText', {
        amount: formatCurrency(payment.amount, settings.currency),
        date: formatDate(payment.date, t),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deletePayment(payment.id),
        },
      ]
    );
  };

  const dueColor = balance.due > 0 ? theme.danger : balance.due < 0 ? theme.info : theme.success;

  return (
    <View>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('payments.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('payments.subtitle')}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={openCreate}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={16} color={theme.onPrimary} />
          <Text style={[styles.addBtnText, { color: theme.onPrimary }]}>{t('payments.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Выбор периода */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {monthOptions.map(monthKey => {
          const isSelected = monthKey === selectedMonth;
          const monthBalance = balances.find(b => b.monthKey === monthKey);
          const hasDebt = (monthBalance?.due ?? 0) > 0;

          return (
            <TouchableOpacity
              key={monthKey}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedMonth(monthKey)}
            >
              {hasDebt && !isSelected && (
                <View style={[styles.debtDot, { backgroundColor: theme.danger }]} />
              )}
              <Text
                style={[styles.chipText, { color: isSelected ? theme.onPrimary : theme.textSecondary }]}
              >
                {getMonthTitle(monthKey, t)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Начислено / оплачено / остаток */}
      <View style={[styles.balanceCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceCol}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
              {t('payments.charged')}
            </Text>
            <Text style={[styles.balanceValue, { color: theme.text }]}>
              {formatCurrency(balance.charged, settings.currency)}
            </Text>
          </View>

          <View style={styles.balanceCol}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
              {t('payments.paid')}
            </Text>
            <Text style={[styles.balanceValue, { color: theme.success }]}>
              {formatCurrency(balance.paid, settings.currency)}
            </Text>
          </View>

          <View style={styles.balanceCol}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
              {balance.due < 0 ? t('payments.overpaid') : t('payments.due')}
            </Text>
            <Text style={[styles.balanceValue, { color: dueColor }]}>
              {formatCurrency(Math.abs(balance.due), settings.currency)}
            </Text>
          </View>
        </View>

        {balance.charged > 0 && (
          <View style={[styles.progressTrack, { backgroundColor: theme.surfaceLight }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, Math.round((balance.paid / balance.charged) * 100))}%`,
                  backgroundColor: dueColor,
                },
              ]}
            />
          </View>
        )}

        {balance.isSettled && (
          <View style={styles.settledRow}>
            <Ionicons name="checkmark-circle" size={16} color={theme.success} />
            <Text style={[styles.settledText, { color: theme.success }]}>
              {t('payments.settled')}
            </Text>
          </View>
        )}

        {balance.due > 0 && (
          <TouchableOpacity
            style={[styles.fillDueBtn, { backgroundColor: theme.badgeBg, borderColor: theme.primary + '55' }]}
            onPress={openCreate}
            activeOpacity={0.8}
          >
            <Ionicons name="wallet-outline" size={16} color={theme.primary} />
            <Text style={[styles.fillDueText, { color: theme.primary }]}>
              {t('payments.fillDue', { amount: formatCurrency(balance.due, settings.currency) })}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Список платежей периода */}
      {monthPayments.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="wallet-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('payments.emptyTitle')}</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t('payments.emptyText')}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {monthPayments.map(payment => {
            const color = payment.meterType ? getMeterColor(payment.meterType) : theme.primary;
            const icon = payment.meterType
              ? getMeterIcon(payment.meterType)
              : PAYMENT_METHOD_ICONS[payment.method];

            return (
              <View
                key={payment.id}
                style={[styles.paymentCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={[styles.payIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon as any} size={18} color={color} />
                </View>

                <View style={styles.payInfo}>
                  <Text style={[styles.payTitle, { color: theme.text }]}>
                    {payment.meterType
                      ? getMeterTypeLabel(payment.meterType, t)
                      : t('payments.generalPayment')}
                  </Text>
                  <Text style={[styles.paySub, { color: theme.textSecondary }]}>
                    {formatDate(payment.date, t)} • {getPaymentMethodLabel(payment.method, t)} •{' '}
                    {t('payments.forPeriod', { period: getMonthTitle(payment.monthKey, t) })}
                  </Text>
                  {payment.notes ? (
                    <Text style={[styles.payNotes, { color: theme.textMuted }]} numberOfLines={1}>
                      {payment.notes}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.payRight}>
                  <Text style={[styles.payAmount, { color: theme.success }]}>
                    {formatCurrency(payment.amount, settings.currency)}
                  </Text>
                  <View style={styles.payActions}>
                    {payment.receiptPhoto && (
                      <Ionicons name="image-outline" size={16} color={theme.textMuted} />
                    )}
                    <TouchableOpacity onPress={() => openEdit(payment)} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(payment)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Форма платежа */}
      <AppModal
        visible={isFormOpen}
        variant="sheet"
        onRequestClose={closeForm}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? t('payments.editTitle') : t('payments.newTitle')}
              </Text>
              <TouchableOpacity onPress={closeForm}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalHint, { color: theme.textMuted }]}>
                {t('payments.chargedHint', {
                  period: getMonthTitle(form.monthKey, t),
                  amount: formatCurrency(
                    calculateMonthBalance(form.monthKey, readings, payments).charged,
                    settings.currency
                  ),
                })}
              </Text>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.amountLabel', { currency: settings.currency })}
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: isAmountValid || !form.amount ? theme.inputBorder : theme.danger,
                    color: theme.text,
                  },
                ]}
                value={form.amount}
                onChangeText={value => setForm(prev => ({ ...prev, amount: value }))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.periodLabel')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.optionRow}>
                  {monthOptions.slice(0, 12).map(monthKey => {
                    const isSelected = form.monthKey === monthKey;
                    return (
                      <TouchableOpacity
                        key={monthKey}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => setForm(prev => ({ ...prev, monthKey }))}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isSelected ? theme.onPrimary : theme.textSecondary },
                          ]}
                        >
                          {getMonthTitle(monthKey, t)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.resourceLabel')}
              </Text>
              <View style={styles.optionGrid}>
                <TouchableOpacity
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: !form.meterType ? theme.badgeBg : theme.surfaceLight,
                      borderColor: !form.meterType ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setForm(prev => ({ ...prev, meterType: undefined }))}
                >
                  <Ionicons
                    name="layers-outline"
                    size={16}
                    color={!form.meterType ? theme.primary : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: !form.meterType ? theme.primary : theme.text },
                    ]}
                  >
                    {t('payments.resourceAll')}
                  </Text>
                </TouchableOpacity>

                {METER_TYPE_ORDER.map(type => {
                  const isSelected = form.meterType === type;
                  const color = getMeterColor(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: isSelected ? color + '22' : theme.surfaceLight,
                          borderColor: isSelected ? color : theme.border,
                        },
                      ]}
                      onPress={() => setForm(prev => ({ ...prev, meterType: type }))}
                    >
                      <Ionicons
                        name={getMeterIcon(type) as any}
                        size={16}
                        color={isSelected ? color : theme.textSecondary}
                      />
                      <Text
                        style={[styles.optionChipText, { color: isSelected ? color : theme.text }]}
                        numberOfLines={1}
                      >
                        {getMeterTypeLabel(type, t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.methodLabel')}
              </Text>
              <View style={styles.optionGrid}>
                {PAYMENT_METHOD_ORDER.map(method => {
                  const isSelected = form.method === method;
                  return (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: isSelected ? theme.badgeBg : theme.surfaceLight,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setForm(prev => ({ ...prev, method }))}
                    >
                      <Ionicons
                        name={PAYMENT_METHOD_ICONS[method] as any}
                        size={16}
                        color={isSelected ? theme.primary : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.optionChipText,
                          { color: isSelected ? theme.primary : theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {getPaymentMethodLabel(method, t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.dateLabel')}
              </Text>
              <DateField
                value={form.date}
                onChange={value => setForm(prev => ({ ...prev, date: value }))}
                invalid={!isDateValid}
              />

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                {t('payments.notesLabel')}
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
                ]}
                value={form.notes}
                onChangeText={value => setForm(prev => ({ ...prev, notes: value }))}
                placeholder={t('payments.notesPlaceholder')}
                placeholderTextColor={theme.textMuted}
              />

              <View style={{ marginTop: 16 }}>
                <PhotoField
                  label="payments.receiptLabel"
                  hint="payments.receiptHint"
                  fileName={form.receiptPhoto}
                  onChange={handlePhotoChange}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor:
                      isAmountValid && isDateValid ? theme.primary : theme.surfaceLight,
                  },
                ]}
                onPress={handleSubmit}
                disabled={!isAmountValid || !isDateValid}
              >
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: isAmountValid && isDateValid ? theme.onPrimary : theme.textMuted },
                  ]}
                >
                  {editingId ? t('common.save') : t('common.create')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardOverlay>
      </AppModal>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
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
  addBtn: {
    ...button.sm,
  },
  addBtnText: {
    ...buttonText.sm,
  },
  chipRow: {
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  debtDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  balanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  balanceCol: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  balanceValue: {
    fontSize: fontSize.md,
    fontFamily: font.extrabold,
    marginTop: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  settledText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  fillDueBtn: {
    ...button.md,
    borderWidth: 1,
    marginTop: 14,
  },
  fillDueText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
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
  list: {
    gap: 10,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  payIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payInfo: {
    flex: 1,
  },
  payTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  paySub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  payNotes: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
    fontStyle: 'italic',
  },
  payRight: {
    alignItems: 'flex-end',
  },
  payAmount: {
    fontSize: fontSize.sm,
    fontFamily: font.extrabold,
  },
  payActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  iconBtn: {
    padding: 4,
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
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  modalHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginBottom: 6,
    lineHeight: 17,
  },
  modalLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 50,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  optionRow: {
    flexDirection: 'row',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: '47%',
    flex: 1,
  },
  optionChipText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    flex: 1,
  },
  saveBtn: {
    ...button.lg,
    marginTop: 18,
    marginBottom: 8,
  },
  saveBtnText: {
    ...buttonText.lg,
  },
});
