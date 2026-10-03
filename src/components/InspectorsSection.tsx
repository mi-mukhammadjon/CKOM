import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Inspector, MeterType } from '../types';
import { METER_PRESETS, METER_TYPE_ORDER } from '../constants/defaults';
import { getMeterColor, getMeterIcon, getMeterTypeLabel } from '../utils/meters';
import {
  formatUzPhone,
  getPhoneLink,
  getTelegramLink,
  normalizeTelegramUsername,
  toStoredUzPhone,
  uzLocalDigits,
} from '../utils/inspectors';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { appAlert, appError } from './AppDialog';
import { KeyboardOverlay } from './KeyboardOverlay';
import { PhoneField } from './PhoneField';
import { AppModal } from './AppModal';

/** Фирменный цвет Telegram — кнопка узнается сразу */
const TELEGRAM_BLUE = '#229ED9';

/** Открывает ссылку и сообщает, если на устройстве нечем ее открыть */
export async function openInspectorLink(url: string, failedText: string, errorTitle: string) {
  try {
    await Linking.openURL(url);
  } catch {
    appError(errorTitle, failedText);
  }
}

interface FormState {
  name: string;
  organization: string;
  phone: string;
  telegram: string;
  notes: string;
}

const EMPTY_FORM: FormState = { name: '', organization: '', phone: '', telegram: '', notes: '' };

/**
 * Раздел настроек с контактами инспекторов активного объекта:
 * по одному на каждый вид ресурса, с переходом в Telegram и звонком.
 */
export const InspectorsSection: React.FC = () => {
  const { theme, meters, inspectors, activeProperty, saveInspector, deleteInspector, t } = useApp();

  const [editingType, setEditingType] = useState<MeterType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Показываем виды ресурсов, для которых в объекте есть счетчики
  const presentTypes = METER_TYPE_ORDER.filter(type => meters.some(m => m.type === type));
  const types = presentTypes.length > 0 ? presentTypes : METER_TYPE_ORDER;

  const findInspector = (type: MeterType) => inspectors.find(i => i.meterType === type);

  const openEditor = (type: MeterType) => {
    const current = findInspector(type);
    setForm({
      name: current?.name ?? '',
      organization: current?.organization ?? '',
      phone: current?.phone ? toStoredUzPhone(uzLocalDigits(current.phone)) : '',
      telegram: current?.telegram ? `@${current.telegram}` : '',
      notes: current?.notes ?? '',
    });
    setEditingType(type);
  };

  const closeEditor = () => setEditingType(null);

  const handleSave = async () => {
    if (!editingType) return;

    const telegram = normalizeTelegramUsername(form.telegram);
    if (telegram === null) {
      appError(t('common.error'), t('inspectors.invalidTelegram'));
      return;
    }
    // Номер либо пустой, либо полный: 9 цифр после +998
    if (form.phone && uzLocalDigits(form.phone).length !== 9) {
      appError(t('common.error'), t('inspectors.invalidPhone'));
      return;
    }

    await saveInspector(editingType, { ...form, telegram, phone: form.phone || undefined });
    closeEditor();
  };

  const handleDelete = (inspector: Inspector) => {
    const type = getMeterTypeLabel(inspector.meterType, t);
    appAlert(t('inspectors.deleteTitle'), t('inspectors.deleteText', { type }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteInspector(inspector.id);
          closeEditor();
        },
      },
    ]);
  };

  const editingInspector = editingType ? findInspector(editingType) : undefined;

  const field = (
    key: keyof FormState,
    label: string,
    placeholder: string,
    extra: Partial<React.ComponentProps<typeof TextInput>> = {}
  ) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
        ]}
        value={form[key]}
        onChangeText={text => setForm(prev => ({ ...prev, [key]: text }))}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        {...extra}
      />
    </View>
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {t('inspectors.section', { property: activeProperty.name.toUpperCase() })}
      </Text>
      <Text style={[styles.sectionHint, { color: theme.textMuted }]}>{t('inspectors.hint')}</Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {types.map((type, idx) => {
          const inspector = findInspector(type);
          const color = getMeterColor(type);
          const telegramLink = inspector ? getTelegramLink(inspector) : null;
          const phoneLink = inspector ? getPhoneLink(inspector) : null;
          const subtitle = inspector
            ? [inspector.name, inspector.organization].filter(Boolean).join(' • ') ||
              (inspector.telegram ? `@${inspector.telegram}` : formatUzPhone(inspector.phone))
            : t('inspectors.notSet');

          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.row,
                idx !== types.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderLight,
                },
              ]}
              onPress={() => openEditor(type)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
                <Ionicons name={getMeterIcon(type) as any} size={18} color={color} />
              </View>

              <View style={styles.info}>
                <Text style={[styles.typeName, { color: theme.text }]} numberOfLines={1}>
                  {getMeterTypeLabel(type, t)}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    { color: inspector ? theme.textSecondary : theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </View>

              {phoneLink && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.surfaceLight }]}
                  onPress={() =>
                    openInspectorLink(phoneLink, t('inspectors.openFailed'), t('common.error'))
                  }
                  accessibilityLabel={t('inspectors.call')}
                >
                  <Ionicons name="call-outline" size={18} color={theme.success} />
                </TouchableOpacity>
              )}

              {telegramLink && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: TELEGRAM_BLUE }]}
                  onPress={() =>
                    openInspectorLink(telegramLink, t('inspectors.openFailed'), t('common.error'))
                  }
                  accessibilityLabel={t('inspectors.openTelegram')}
                >
                  <Ionicons name="paper-plane" size={17} color="#FFFFFF" />
                </TouchableOpacity>
              )}

              {!inspector && (
                <Ionicons name="add-circle-outline" size={22} color={theme.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <AppModal
        visible={!!editingType}
        variant="center"
        onRequestClose={closeEditor}
      >
        <KeyboardOverlay style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {editingType && (
              <View style={styles.modalHeader}>
                <View
                  style={[styles.iconBox, { backgroundColor: getMeterColor(editingType) + '22' }]}
                >
                  <Ionicons
                    name={METER_PRESETS[editingType].icon as any}
                    size={18}
                    color={getMeterColor(editingType)}
                  />
                </View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {t('inspectors.editTitle', { type: getMeterTypeLabel(editingType, t) })}
                </Text>
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: theme.surfaceLight }]}
                  onPress={closeEditor}
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {field('name', t('inspectors.name'), t('inspectors.namePlaceholder'), {
              autoCapitalize: 'words',
            })}
            {field(
              'organization',
              t('inspectors.organization'),
              t('inspectors.organizationPlaceholder')
            )}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                {t('inspectors.phone')}
              </Text>
              <PhoneField
                value={form.phone}
                onChange={phone => setForm(prev => ({ ...prev, phone }))}
              />
            </View>
            {field('telegram', t('inspectors.telegram'), t('inspectors.telegramPlaceholder'), {
              autoCapitalize: 'none',
              autoCorrect: false,
            })}
            <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
              {t('inspectors.telegramHint')}
            </Text>
            {field('notes', t('inspectors.notes'), t('inspectors.notesPlaceholder'), {
              multiline: true,
              style: [
                styles.input,
                styles.notesInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ],
            })}

            <View style={styles.modalButtons}>
              {editingInspector && (
                <TouchableOpacity
                  style={[styles.deleteBtn, { backgroundColor: theme.danger + '1F' }]}
                  onPress={() => handleDelete(editingInspector)}
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.surfaceLight }]}
                onPress={closeEditor}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={handleSave}
              >
                <Text style={[buttonText.md, { color: theme.onPrimary }]}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardOverlay>
      </AppModal>
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
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  typeName: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  actionBtn: {
    ...button.icon,
    width: 38,
    height: 38,
  },
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xxl,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  modalTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  closeBtn: {
    ...button.icon,
    width: 36,
    height: 36,
  },
  field: {
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 4,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    fontFamily: font.regular,
  },
  notesInput: {
    height: 76,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  deleteBtn: {
    ...button.md,
    width: 46,
    paddingHorizontal: 0,
  },
  modalBtn: {
    ...button.md,
    flex: 1,
  },
});
