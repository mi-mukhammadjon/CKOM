import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import {
  BackHandler,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../context/AppContext';
import { Meter, MeterType, Property } from '../types';
import { shareBackupFile, pickBackupFile } from '../services/backup';
import { formatDate, formatNumber, getTodayDateKey } from '../utils/calculator';
import { getMeterTypeLabel, resolveMeterName, hasReadingHistory } from '../utils/meters';
import { METER_PRESETS, METER_TYPE_ORDER } from '../constants/defaults';
import { LANGUAGES } from '../i18n';
import { font, fontSize, button, buttonText } from '../constants/theme';
import { appAlert, appError, appSuccess } from '../components/AppDialog';
import { KeyboardOverlay } from '../components/KeyboardOverlay';
import { InspectorsSection } from '../components/InspectorsSection';
import { AppModal } from '../components/AppModal';
import { WidgetsSection } from '../components/WidgetsSection';
import { RecoverySection } from '../components/RecoverySection';
import { parseBackup } from '../services/db';
import { CloudSyncSection } from '../components/CloudSyncSection';

type SettingsGroup = 'property' | 'inspectors' | 'interface' | 'cloud' | 'data' | 'widgets' | 'about';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Версия из app.json — не нужно править текст при каждом релизе */
const APP_VERSION = Constants.expoConfig?.version ?? '';

export const SettingsScreen: React.FC = () => {
  const {
    theme,
    isDark,
    settings,
    language,
    t,
    updateSettings,
    properties,
    activeProperty,
    setActivePropertyId,
    addProperty,
    updateProperty,
    deleteProperty,
    meters,
    allReadings,
    addMeter,
    updateMeter,
    deleteMeter,
    resetToDefaults,
    exportBackupData,
    importBackupData,
    cloud,
    inspectors,
    storageBackend,
  } = useApp();

  const [propertyModal, setPropertyModal] = useState<{
    mode: 'create' | 'edit';
    property?: Property;
  } | null>(null);
  const [propertyNameInput, setPropertyNameInput] = useState('');
  // Открытая группа настроек; null — список групп
  const [group, setGroup] = useState<SettingsGroup | null>(null);

  // Системная кнопка «Назад» внутри группы возвращает к списку групп
  useEffect(() => {
    if (!group) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setGroup(null);
      return true;
    });
    return () => subscription.remove();
  }, [group]);
  const [propertyAddressInput, setPropertyAddressInput] = useState('');

  const [meterModal, setMeterModal] = useState<{ mode: 'create' | 'edit'; meter?: Meter } | null>(
    null
  );
  const [meterTypeInput, setMeterTypeInput] = useState<MeterType>('electricity');
  const [meterNameInput, setMeterNameInput] = useState('');
  const [meterSerialInput, setMeterSerialInput] = useState('');
  const [meterReadingInput, setMeterReadingInput] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const currencies = ['сум', '₽', '$', '₸'];
  const reminderDays = [10, 15, 20, 25, 28];
  const reminderHours = [8, 10, 12, 18, 20];

  // ---------- Объекты учета ----------

  const openCreateProperty = () => {
    setPropertyNameInput('');
    setPropertyAddressInput('');
    setPropertyModal({ mode: 'create' });
  };

  const openEditProperty = (property: Property) => {
    setPropertyNameInput(property.name);
    setPropertyAddressInput(property.address || '');
    setPropertyModal({ mode: 'edit', property });
  };

  const handleSaveProperty = async () => {
    const name = propertyNameInput.trim();
    if (!name) {
      appError(t('common.error'), t('settings.propertyNameRequired'));
      return;
    }
    const address = propertyAddressInput.trim() || undefined;

    if (propertyModal?.mode === 'edit' && propertyModal.property) {
      await updateProperty({ ...propertyModal.property, name, address });
      setPropertyModal(null);
      return;
    }

    const created = await addProperty(name, address);
    setActivePropertyId(created.id);
    setPropertyModal(null);
    appSuccess(
      t('settings.propertyCreatedTitle'),
      t('settings.propertyCreatedText', { name: created.name })
    );
  };

  const handleDeleteProperty = (property: Property) => {
    if (properties.length <= 1) {
      appAlert(t('settings.propertyLastTitle'), t('settings.propertyLastText'));
      return;
    }

    appAlert(
      t('settings.propertyDeleteTitle'),
      t('settings.propertyDeleteText', { name: property.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteProperty(property.id);
            if (!ok) appError(t('common.error'), t('settings.propertyDeleteFailed'));
          },
        },
      ]
    );
  };

  // ---------- Счетчики объекта ----------

  const openCreateMeter = () => {
    const usedTypes = new Set(meters.map(m => m.type));
    const freeType = METER_TYPE_ORDER.find(type => !usedTypes.has(type)) || 'electricity';
    setMeterTypeInput(freeType);
    setMeterNameInput(getMeterTypeLabel(freeType, t));
    setMeterSerialInput('');
    setMeterReadingInput('0');
    setMeterModal({ mode: 'create' });
  };

  const openEditMeter = (meter: Meter) => {
    setMeterTypeInput(meter.type);
    setMeterNameInput(resolveMeterName(meter, t));
    setMeterSerialInput(meter.serialNumber || '');
    setMeterReadingInput(String(meter.currentReading));
    setMeterModal({ mode: 'edit', meter });
  };

  const handleSaveMeter = async () => {
    const name = meterNameInput.trim();
    if (!name) {
      appError(t('common.error'), t('settings.meterNameRequired'));
      return;
    }

    const serialNumber = meterSerialInput.trim() || undefined;
    const reading = parseFloat(meterReadingInput.replace(',', '.'));

    if (meterModal?.mode === 'edit' && meterModal.meter) {
      const meter = meterModal.meter;
      if (isNaN(reading) || reading < 0) {
        appError(t('common.error'), t('settings.meterReadingInvalid'));
        return;
      }

      const hasHistory = hasReadingHistory(meter.id, allReadings);
      await updateMeter({
        ...meter,
        name,
        serialNumber,
        // Начальное показание можно править только пока по счетчику нет записей в журнале:
        // иначе значение определяется последней записью
        currentReading: hasHistory ? meter.currentReading : reading,
        // Измененное вручную начальное показание считается внесенным;
        // простое переименование счетчика этого признака не ставит
        lastReadingDate:
          !hasHistory && reading !== meter.currentReading
            ? meter.lastReadingDate || getTodayDateKey()
            : meter.lastReadingDate,
      });
      setMeterModal(null);

      if (hasHistory && reading !== meter.currentReading) {
        appAlert(t('settings.meterReadingLockedTitle'), t('settings.meterReadingLockedText'));
      }
      return;
    }

    if (meterReadingInput.trim() !== '' && (isNaN(reading) || reading < 0)) {
      appError(t('common.error'), t('settings.meterReadingInvalid'));
      return;
    }

    await addMeter(meterTypeInput, {
      name,
      serialNumber,
      currentReading: isNaN(reading) ? 0 : reading,
      // Введенное при создании число — это начальное показание
      initialDate: meterReadingInput.trim() !== '' ? getTodayDateKey() : undefined,
    });
    setMeterModal(null);
  };

  const handleDeleteMeter = (meter: Meter) => {
    appAlert(
      t('settings.meterDeleteTitle'),
      t('settings.meterDeleteText', { name: resolveMeterName(meter, t) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteMeter(meter.id) },
      ]
    );
  };

  // ---------- Резервное копирование ----------

  const handleExportToFile = async () => {
    try {
      setIsBusy(true);
      const json = await exportBackupData();
      const result = await shareBackupFile(json, t('backup.shareDialogTitle'));
      if (!result.shared) {
        await Clipboard.setStringAsync(json);
        appSuccess(
          t('settings.exportSavedTitle'),
          t('settings.exportSavedText', { uri: result.uri })
        );
      }
    } catch (e) {
      appError(t('common.error'), t('settings.exportFailed'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyToClipboard = async () => {
    const json = await exportBackupData();
    await Clipboard.setStringAsync(json);
    appSuccess(t('settings.exportCopiedTitle'), t('settings.exportCopiedText'));
  };

  /** Импорт заменяет все данные — спрашиваем явно (текущее состояние уйдет в автокопию) */
  const confirmReplace = () =>
    new Promise<boolean>(resolve => {
      appAlert(
        t('settings.importConfirmTitle'),
        t('settings.importConfirmText'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('settings.importConfirm'), style: 'destructive', onPress: () => resolve(true) },
        ],
        'warning'
      );
    });

  const handleImportFromFile = async () => {
    try {
      setIsBusy(true);
      const json = await pickBackupFile();
      if (json === null) return; // пользователь отменил выбор

      // Сначала проверяем файл, и только потом спрашиваем о замене
      if (!parseBackup(json)) {
        appError(t('common.error'), t('settings.importBadFile'));
        return;
      }
      const confirmed = await confirmReplace();
      if (!confirmed) return;
      const ok = await importBackupData(json);
      appAlert(
        ok ? t('common.success') : t('common.error'),
        ok ? t('settings.importedFromFile') : t('settings.importBadFile'),
        undefined,
        ok ? 'success' : 'error'
      );
    } catch (e) {
      appError(t('common.error'), t('settings.importReadFailed'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportFromText = async () => {
    if (!importJsonText.trim()) {
      appError(t('common.error'), t('settings.importEmpty'));
      return;
    }

    if (!parseBackup(importJsonText.trim())) {
      appError(t('common.error'), t('settings.importBadFormat'));
      return;
    }
    const confirmed = await confirmReplace();
    if (!confirmed) return;
    const ok = await importBackupData(importJsonText.trim());
    if (ok) {
      setShowImportModal(false);
      setImportJsonText('');
      appSuccess(t('common.success'), t('settings.importedText'));
    } else {
      appError(t('common.error'), t('settings.importBadFormat'));
    }
  };

  const handleResetData = () => {
    appAlert(t('settings.resetTitle'), t('settings.resetText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.resetConfirm'),
        style: 'destructive',
        onPress: async () => {
          await resetToDefaults();
          appSuccess(t('common.success'), t('settings.resetDone'));
        },
      },
    ]);
  };

  // ---------- Группы настроек ----------

  const languageLabel = LANGUAGES.find(option => option.code === language)?.label ?? language;
  const filledInspectors = inspectors.length;

  const groups: { id: SettingsGroup; icon: IconName; title: string; hint: string; hidden?: boolean }[] = [
    {
      id: 'property',
      icon: 'home-outline',
      title: t('settings.group.property'),
      hint: t('settings.group.propertyHint', { name: activeProperty.name, count: meters.length }),
    },
    {
      id: 'inspectors',
      icon: 'people-outline',
      title: t('settings.group.inspectors'),
      hint: t('settings.group.inspectorsHint', { count: filledInspectors }),
    },
    {
      id: 'interface',
      icon: 'color-palette-outline',
      title: t('settings.group.interface'),
      hint: `${languageLabel} · ${settings.currency} · ${
        isDark ? t('settings.group.themeDark') : t('settings.group.themeLight')
      }`,
    },
    {
      id: 'cloud',
      icon: 'cloud-outline',
      title: t('settings.group.cloud'),
      hint: cloud.signedIn && cloud.email ? cloud.email : t('settings.group.cloudOff'),
    },
    {
      id: 'data',
      icon: 'shield-checkmark-outline',
      title: t('settings.group.data'),
      hint: t('settings.group.dataHint'),
    },
    {
      id: 'widgets',
      icon: 'apps-outline',
      title: t('settings.group.widgets'),
      hint: t('settings.group.widgetsHint'),
      hidden: Platform.OS !== 'android',
    },
    {
      id: 'about',
      icon: 'information-circle-outline',
      title: t('settings.group.about'),
      hint: t('settings.group.aboutHint', { version: APP_VERSION }),
    },
  ];

  const sections: Record<SettingsGroup, React.ReactNode> = {
    property: (
      <>
          {/* Объекты учета */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                {t('settings.sectionProperties')}
              </Text>
              <TouchableOpacity onPress={openCreateProperty} style={styles.addPropLink}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={[styles.addPropText, { color: theme.primary }]}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {properties.map((prop, idx) => {
                const isSelected = prop.id === activeProperty.id;
                const isLast = idx === properties.length - 1;

                return (
                  <TouchableOpacity
                    key={prop.id}
                    style={[
                      styles.propertyRow,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                    ]}
                    onPress={() => setActivePropertyId(prop.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.propertyInfo}>
                      <Text
                        style={[
                          styles.propName,
                          { color: theme.text, fontFamily: isSelected ? font.bold : font.medium },
                        ]}
                      >
                        {prop.name}
                      </Text>
                      {prop.address ? (
                        <Text style={[styles.propAddress, { color: theme.textSecondary }]}>
                          {prop.address}
                        </Text>
                      ) : null}
                    </View>

                    {isSelected && (
                      <View style={[styles.activeBadge, { backgroundColor: theme.primary + '20' }]}>
                        <Text style={[styles.activeBadgeText, { color: theme.primary }]}>
                          {t('settings.activeBadge')}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity style={styles.rowIconBtn} onPress={() => openEditProperty(prop)}>
                      <Ionicons name="create-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rowIconBtn}
                      onPress={() => handleDeleteProperty(prop)}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* Счетчики активного объекта */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                {t('settings.sectionMeters', { property: activeProperty.name.toUpperCase() })}
              </Text>
              <TouchableOpacity onPress={openCreateMeter} style={styles.addPropLink}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={[styles.addPropText, { color: theme.primary }]}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {meters.length === 0 ? (
                <Text style={[styles.emptyRowText, { color: theme.textSecondary }]}>
                  {t('settings.noMeters')}
                </Text>
              ) : (
                meters.map((meter, idx) => (
                  <View
                    key={meter.id}
                    style={[
                      styles.propertyRow,
                      idx !== meters.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.borderLight,
                      },
                    ]}
                  >
                    <View style={[styles.meterIconBox, { backgroundColor: meter.color + '22' }]}>
                      <Ionicons name={meter.icon as any} size={18} color={meter.color} />
                    </View>

                    <View style={styles.propertyInfo}>
                      <Text style={[styles.propName, { color: theme.text, fontFamily: font.semibold }]}>
                        {resolveMeterName(meter, t)}
                      </Text>
                      <Text style={[styles.propAddress, { color: theme.textSecondary }]}>
                        {formatNumber(meter.currentReading)} {meter.unit}
                        {meter.lastReadingDate
                          ? ` • ${formatDate(meter.lastReadingDate, t)}`
                          : ` • ${t('settings.meterNoReadings')}`}
                        {meter.serialNumber ? ` • № ${meter.serialNumber}` : ''}
                      </Text>
                    </View>

                    <TouchableOpacity style={styles.rowIconBtn} onPress={() => openEditMeter(meter)}>
                      <Ionicons name="create-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.rowIconBtn} onPress={() => handleDeleteMeter(meter)}>
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>
      </>
    ),
    inspectors: <InspectorsSection />,
    interface: (
      <>
          {/* Язык интерфейса */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('settings.sectionLanguage')}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.currencyRow}>
                {LANGUAGES.map(option => {
                  const isSelected = language === option.code;
                  return (
                    <TouchableOpacity
                      key={option.code}
                      style={[
                        styles.currBtn,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => updateSettings({ language: option.code })}
                    >
                      <Text
                        style={[
                          styles.currBtnText,
                          {
                            color: isSelected ? theme.onPrimary : theme.text,
                            fontFamily: isSelected ? font.extrabold : font.semibold,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          {/* Валюта */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('settings.sectionCurrency')}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.currencyRow}>
                {currencies.map(curr => {
                  const isSelected = settings.currency === curr;
                  return (
                    <TouchableOpacity
                      key={curr}
                      style={[
                        styles.currBtn,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => updateSettings({ currency: curr })}
                    >
                      <Text
                        style={[
                          styles.currBtnText,
                          {
                            color: isSelected ? theme.onPrimary : theme.text,
                            fontFamily: isSelected ? font.extrabold : font.semibold,
                          },
                        ]}
                      >
                        {curr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          {/* Интерфейс и напоминания */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('settings.sectionInterface')}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View
                style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
              >
                <View style={styles.settingInfo}>
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: theme.text }]}>
                      {t('settings.darkTheme')}
                    </Text>
                    <Text style={[styles.settingSub, { color: theme.textSecondary }]}>
                      {isDark ? t('settings.darkThemeOn') : t('settings.darkThemeOff')}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={isDark}
                  onValueChange={val => updateSettings({ theme: val ? 'dark' : 'light' })}
                  trackColor={{ false: theme.border, true: theme.primary }}
                />
              </View>

              <View
                style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
              >
                <View style={styles.settingInfo}>
                  <Ionicons name="notifications-outline" size={20} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: theme.text }]}>
                      {t('settings.notifications')}
                    </Text>
                    <Text style={[styles.settingSub, { color: theme.textSecondary }]}>
                      {Platform.OS === 'web'
                        ? t('settings.notificationsWeb')
                        : settings.notificationsEnabled
                        ? t('settings.notificationsOn', {
                            day: settings.reminderDay,
                            hour: settings.reminderHour,
                          })
                        : t('settings.notificationsOff')}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={settings.notificationsEnabled && Platform.OS !== 'web'}
                  disabled={Platform.OS === 'web'}
                  onValueChange={async val => {
                    await updateSettings({ notificationsEnabled: val });
                    if (val) {
                      // Разрешение могло быть отклонено на системном уровне
                      appSuccess(
                        t('settings.notificationsSetTitle'),
                        t('settings.notificationsSetText')
                      );
                    }
                  }}
                  trackColor={{ false: theme.border, true: theme.primary }}
                />
              </View>

              <View
                style={[
                  styles.settingColumn,
                  { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                ]}
              >
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  {t('settings.reminderDay')}
                </Text>
                <Text style={[styles.settingSub, { color: theme.textSecondary, marginBottom: 8 }]}>
                  {t('settings.reminderDaySub', { day: settings.reminderDay })}
                </Text>
                <View style={styles.daySelectorRow}>
                  {reminderDays.map(day => {
                    const isSelected = settings.reminderDay === day;
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.dayBtn,
                          {
                            backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => updateSettings({ reminderDay: day })}
                      >
                        <Text
                          style={[
                            styles.dayBtnText,
                            { color: isSelected ? theme.onPrimary : theme.textSecondary },
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.settingColumn}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  {t('settings.reminderHour')}
                </Text>
                <Text style={[styles.settingSub, { color: theme.textSecondary, marginBottom: 8 }]}>
                  {t('settings.reminderHourSub', { hour: settings.reminderHour })}
                </Text>
                <View style={styles.daySelectorRow}>
                  {reminderHours.map(hour => {
                    const isSelected = settings.reminderHour === hour;
                    return (
                      <TouchableOpacity
                        key={hour}
                        style={[
                          styles.dayBtn,
                          {
                            backgroundColor: isSelected ? theme.primary : theme.surfaceLight,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => updateSettings({ reminderHour: hour })}
                      >
                        <Text
                          style={[
                            styles.dayBtnText,
                            { color: isSelected ? theme.onPrimary : theme.textSecondary },
                          ]}
                        >
                          {hour}:00
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
      </>
    ),
    cloud: <CloudSyncSection />,
    data: (
      <>
          {/* Данные и бэкап */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('settings.sectionData')}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Автокопии: восстановление после ошибочного импорта или сбоя */}
              <RecoverySection />

              <TouchableOpacity
                style={[styles.actionRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
                onPress={handleExportToFile}
                disabled={isBusy}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="share-outline" size={20} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionTitle, { color: theme.text }]}>
                      {t('settings.exportFile')}
                    </Text>
                    <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                      {t('settings.exportFileSub')}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
                onPress={handleImportFromFile}
                disabled={isBusy}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="document-attach-outline" size={20} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionTitle, { color: theme.text }]}>
                      {t('settings.importFile')}
                    </Text>
                    <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                      {t('settings.importFileSub')}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
                onPress={handleCopyToClipboard}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="copy-outline" size={20} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionTitle, { color: theme.text }]}>
                      {t('settings.copyJson')}
                    </Text>
                    <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                      {t('settings.copyJsonSub')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
                onPress={() => setShowImportModal(true)}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="clipboard-outline" size={20} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionTitle, { color: theme.text }]}>
                      {t('settings.pasteJson')}
                    </Text>
                    <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                      {t('settings.pasteJsonSub')}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={handleResetData}>
                <View style={styles.actionLeft}>
                  <Ionicons name="trash-bin-outline" size={20} color={theme.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionTitle, { color: theme.danger }]}>
                      {t('settings.clearData')}
                    </Text>
                    <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                      {t('settings.clearDataSub')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
      </>
    ),
    widgets: <WidgetsSection />,
    about: (
      <>
          {/* О приложении */}
          <View style={[styles.aboutCard, { backgroundColor: theme.surfaceLight }]}>
            <Image source={require('../../assets/icon.png')} style={styles.aboutIcon} />
            <Text style={[styles.aboutTitle, { color: theme.text }]}>{t('settings.aboutName')}</Text>
            <Text style={[styles.aboutSub, { color: theme.textSecondary }]}>
              {t('settings.aboutVersion', { version: APP_VERSION })}
            </Text>
            <Text style={[styles.aboutDesc, { color: theme.textMuted }]}>
              {t('settings.aboutDesc')}
            </Text>
            <Text style={[styles.aboutDesc, { color: theme.textMuted }]}>
              {storageBackend === 'sqlite' ? t('settings.storageEncrypted') : t('settings.storageWeb')}
            </Text>
          </View>
      </>
    ),
  };

  const current = group ? groups.find(item => item.id === group) : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {current ? (
          // Внутри группы: кнопка «назад» к списку групп
          <View style={styles.groupHeader}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: theme.surfaceLight }]}
              onPress={() => setGroup(null)}
              accessibilityLabel={t('common.back')}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.groupTitle, { color: theme.text }]} numberOfLines={1}>
              {current.title}
            </Text>
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>{t('settings.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {t('settings.subtitle')}
              </Text>
            </View>
          </View>
        )}

        {group ? (
          sections[group]
        ) : (
          // Список групп: короткая сводка в каждой строке, без длинных форм на одной странице
          <View style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {groups
              .filter(item => !item.hidden)
              .map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.menuRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight },
                  ]}
                  onPress={() => setGroup(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIcon, { backgroundColor: theme.badgeBg }]}>
                    <Ionicons name={item.icon} size={20} color={theme.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.menuHint, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              ))}
          </View>
        )}
      </ScrollView>

      {/* Модальное окно объекта */}
      <AppModal
        visible={!!propertyModal}
        variant="center"
        onRequestClose={() => setPropertyModal(null)}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalHeading, { color: theme.text }]}>
              {propertyModal?.mode === 'edit'
                ? t('settings.propertyEditTitle')
                : t('settings.propertyNewTitle')}
            </Text>
            {propertyModal?.mode === 'create' && (
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                {t('settings.propertyNewHint')}
              </Text>
            )}

            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              placeholder={t('settings.propertyNamePlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={propertyNameInput}
              onChangeText={setPropertyNameInput}
            />

            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                  marginTop: 10,
                },
              ]}
              placeholder={t('settings.propertyAddressPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={propertyAddressInput}
              onChangeText={setPropertyAddressInput}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancel, { backgroundColor: theme.surfaceLight }]}
                onPress={() => setPropertyModal(null)}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: theme.primary }]}
                onPress={handleSaveProperty}
              >
                <Text style={[buttonText.md, { color: theme.onPrimary }]}>
                  {propertyModal?.mode === 'edit' ? t('common.save') : t('common.create')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardOverlay>
      </AppModal>

      {/* Модальное окно счетчика */}
      <AppModal
        visible={!!meterModal}
        variant="center"
        onRequestClose={() => setMeterModal(null)}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalHeading, { color: theme.text }]}>
              {meterModal?.mode === 'edit'
                ? t('settings.meterEditTitle')
                : t('settings.meterNewTitle')}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {t('settings.meterProperty', { name: activeProperty.name })}
            </Text>

            {meterModal?.mode === 'create' && (
              <>
                <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>
                  {t('settings.meterTypeLabel')}
                </Text>
                <View style={styles.typeGrid}>
                  {METER_TYPE_ORDER.map(type => {
                    const preset = METER_PRESETS[type];
                    const isSelected = meterTypeInput === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.typeChip,
                          {
                            backgroundColor: isSelected ? preset.color + '22' : theme.surfaceLight,
                            borderColor: isSelected ? preset.color : theme.border,
                          },
                        ]}
                        onPress={() => {
                          setMeterTypeInput(type);
                          setMeterNameInput(getMeterTypeLabel(type, t));
                        }}
                      >
                        <Ionicons
                          name={preset.icon as any}
                          size={16}
                          color={isSelected ? preset.color : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.typeChipText,
                            { color: isSelected ? preset.color : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {getMeterTypeLabel(type, t)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>
              {t('settings.meterNameLabel')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              placeholder={t('settings.meterNamePlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={meterNameInput}
              onChangeText={setMeterNameInput}
            />

            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>
              {t('settings.meterSerialLabel')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              placeholder={t('settings.meterSerialPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={meterSerialInput}
              onChangeText={setMeterSerialInput}
            />

            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>
              {meterModal?.mode === 'edit' && meterModal.meter && hasReadingHistory(meterModal.meter.id, allReadings)
                ? t('settings.meterReadingFromLog')
                : t('settings.meterReadingLabel')}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                  opacity:
                    meterModal?.mode === 'edit' && meterModal.meter && hasReadingHistory(meterModal.meter.id, allReadings) ? 0.5 : 1,
                },
              ]}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={meterReadingInput}
              onChangeText={setMeterReadingInput}
              editable={!(meterModal?.mode === 'edit' && meterModal.meter && hasReadingHistory(meterModal.meter.id, allReadings))}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancel, { backgroundColor: theme.surfaceLight }]}
                onPress={() => setMeterModal(null)}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: theme.primary }]}
                onPress={handleSaveMeter}
              >
                <Text style={[buttonText.md, { color: theme.onPrimary }]}>
                  {meterModal?.mode === 'edit' ? t('common.save') : t('common.create')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardOverlay>
      </AppModal>

      {/* Импорт текстом */}
      <AppModal
        visible={showImportModal}
        variant="center"
        onRequestClose={() => setShowImportModal(false)}
      >
        <KeyboardOverlay style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalHeading, { color: theme.text }]}>
              {t('settings.importTitle')}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {t('settings.importHint')}
            </Text>

            <TextInput
              style={[
                styles.jsonInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              multiline
              value={importJsonText}
              onChangeText={setImportJsonText}
              placeholder='{"version": "3.0", ...}'
              placeholderTextColor={theme.textMuted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancel, { backgroundColor: theme.surfaceLight }]}
                onPress={() => setShowImportModal(false)}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: theme.primary }]}
                onPress={handleImportFromText}
              >
                <Text style={[buttonText.md, { color: theme.onPrimary }]}>
                  {t('settings.importBtn')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardOverlay>
      </AppModal>

      <View style={{ height: 40 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  menu: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  menuHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  backBtn: {
    ...button.icon,
  },
  groupTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontFamily: font.bold,
  },
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
  section: {
    marginBottom: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    flex: 1,
  },
  addPropLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  addPropText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  propertyInfo: {
    flex: 1,
  },
  propName: {
    fontSize: fontSize.md,
    fontFamily: font.regular,
  },
  propAddress: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  rowIconBtn: {
    padding: 6,
  },
  meterIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRowText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    padding: 16,
    lineHeight: 19,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  currencyRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
  },
  currBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  currBtnText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  settingColumn: {
    padding: 14,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  settingSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  daySelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayBtnText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  actionTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  actionSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  aboutCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  aboutIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  aboutTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  aboutSub: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginTop: 2,
  },
  aboutDesc: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  modalHeading: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginBottom: 12,
  },
  inlineLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: '45%',
    flex: 1,
  },
  typeChipText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    flex: 1,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    fontSize: fontSize.sm,
    fontFamily: font.regular,
  },
  jsonInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    height: 120,
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    textAlignVertical: 'top',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancel: {
    ...button.md,
    flex: 1,
  },
  modalSubmit: {
    ...button.md,
    flex: 1,
  },
});
