import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  AppData,
  AppSettings,
  Inspector,
  Language,
  Meter,
  MeterType,
  MonthBalance,
  Payment,
  PaymentMethod,
  Property,
  ReadingEntry,
  Tariff,
} from '../types';
import { parseBackup, repository, serializeBackup } from '../services/db';
import type { RecoveryCandidate } from '../services/db/types';
import {
  SyncError,
  SyncErrorCode,
  SyncState,
  deleteCloudCopy,
  loadSyncState,
  signIn as syncSignIn,
  signOut as syncSignOut,
  signUp as syncSignUp,
  syncNow,
} from '../sync/engine';
import { isSyncConfigured } from '../sync/supabase';
import { normalizeAppData, stripSampleData } from '../services/normalize';
import { syncReadingReminder } from '../services/notifications';
import { compressExistingPhotos, deleteOrphanPhotos, deletePhoto } from '../services/photos';
import {
  DEFAULT_METERS,
  DEFAULT_PROPERTIES,
  DEFAULT_SETTINGS,
  DEFAULT_TARIFFS,
  createDefaultMetersForProperty,
  createMeterForProperty,
} from '../constants/defaults';
import { DarkTheme, LightTheme, ThemeColors } from '../constants/theme';
import { createTranslator, type Translate } from '../i18n';
import { calculateAllBalances, calculateReadingCost, calculateTotalDebt } from '../utils/calculator';
import {
  byOldestReading,
  previousReadingFor,
  recomputeMeterState,
  recomputeReadingChain,
  repairReadingHistory,
} from '../utils/readings';

export interface AddReadingInput {
  meterId: string;
  meterType: MeterType;
  reading: number;
  date: string;
  notes?: string;
  /** Счетчик заменен: расход считается от нуля */
  isReplacement?: boolean;
  /** Имя файла снимка счетчика */
  photo?: string;
}

export interface UpdateReadingInput {
  reading?: number;
  date?: string;
  notes?: string;
  isReplacement?: boolean;
  /** null — убрать существующий снимок */
  photo?: string | null;
}

export interface NewMeterOptions {
  name?: string;
  serialNumber?: string;
  /** Начальное показание прибора */
  currentReading?: number;
  /** Дата начального показания; без нее счетчик считается ожидающим начальных цифр */
  initialDate?: string;
}

export interface InitialReadingInput {
  meterId: string;
  reading: number;
}

/** Поля инспектора; пустые значения означают «не задано» */
export interface InspectorInput {
  name?: string;
  organization?: string;
  phone?: string;
  telegram?: string;
  notes?: string;
}

export interface PaymentInput {
  monthKey: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  meterType?: MeterType;
  notes?: string;
  receiptPhoto?: string | null;
}

interface AppContextValue {
  loading: boolean;
  /** Язык интерфейса и функция перевода */
  language: Language;
  t: Translate;

  /** Данные активного объекта */
  meters: Meter[];
  readings: ReadingEntry[];
  payments: Payment[];
  /** Инспекторы активного объекта */
  inspectors: Inspector[];
  balances: MonthBalance[];
  totalDebt: number;

  /** Данные по всем объектам */
  allMeters: Meter[];
  allReadings: ReadingEntry[];
  allPayments: Payment[];

  tariffs: Tariff[];
  properties: Property[];
  settings: AppSettings;
  activeProperty: Property;
  theme: ThemeColors;
  isDark: boolean;
  storageBackend: 'sqlite' | 'async-storage';

  // Объекты учета
  setActivePropertyId: (id: string) => void;
  addProperty: (name: string, address?: string) => Promise<Property>;
  updateProperty: (property: Property) => Promise<void>;
  deleteProperty: (id: string) => Promise<boolean>;

  // Счетчики
  addMeter: (type: MeterType, options?: NewMeterOptions) => Promise<Meter>;
  updateMeter: (meter: Meter) => Promise<void>;
  deleteMeter: (id: string) => Promise<void>;
  /** Начальные цифры счетчиков без истории: от них считается первый расход */
  setInitialReadings: (values: InitialReadingInput[], date: string) => Promise<void>;

  // Показания
  addReading: (data: AddReadingInput) => Promise<ReadingEntry>;
  updateReading: (id: string, changes: UpdateReadingInput) => Promise<void>;
  deleteReading: (id: string) => Promise<void>;

  // Инспекторы: один на вид ресурса в активном объекте
  saveInspector: (meterType: MeterType, input: InspectorInput) => Promise<void>;
  deleteInspector: (id: string) => Promise<void>;

  // Платежи
  addPayment: (data: PaymentInput) => Promise<Payment>;
  updatePayment: (id: string, changes: PaymentInput) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;

  // Тарифы и настройки
  updateTariff: (tariff: Tariff) => Promise<void>;
  resetTariffs: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;

  // Данные
  resetToDefaults: () => Promise<void>;
  importBackupData: (jsonStr: string) => Promise<boolean>;
  exportBackupData: () => Promise<string>;

  // Облачная синхронизация (сквозное шифрование)
  cloud: CloudStatus;
  cloudSignIn: (email: string, password: string) => Promise<void>;
  cloudSignUp: (email: string, password: string) => Promise<'ready' | 'confirm_email'>;
  cloudSignOut: () => Promise<void>;
  cloudSyncNow: () => Promise<void>;
  cloudDeleteCopy: () => Promise<void>;

  // Копии и восстановление
  /** Найденные при запуске данные, которые можно вернуть (основная база пуста) */
  recoveryOffer: RecoveryCandidate | null;
  dismissRecoveryOffer: () => void;
  listRecoveryCandidates: () => Promise<RecoveryCandidate[]>;
  restoreFromCandidate: (name: string) => Promise<void>;

  getTariffForMeter: (meterType: MeterType) => Tariff | undefined;
  getMeterById: (meterId: string) => Meter | undefined;
}

export interface CloudStatus {
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  syncing: boolean;
  error: SyncErrorCode | null;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Сортировка показаний: сначала самые свежие */
function byNewestReading(a: ReadingEntry, b: ReadingEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

/** Сортировка платежей: сначала самые свежие */
function byNewestPayment(a: Payment, b: Payment): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

/** Все снимки, на которые ссылаются данные */
function collectPhotoNames(data: AppData): string[] {
  const names: string[] = [];
  data.readings.forEach(r => r.photo && names.push(r.photo));
  data.payments.forEach(p => p.receiptPhoto && names.push(p.receiptPhoto));
  return names;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [allMeters, setAllMeters] = useState<Meter[]>(DEFAULT_METERS);
  const [tariffs, setTariffs] = useState<Tariff[]>(DEFAULT_TARIFFS);
  const [properties, setProperties] = useState<Property[]>(DEFAULT_PROPERTIES);
  const [allReadings, setAllReadings] = useState<ReadingEntry[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allInspectors, setAllInspectors] = useState<Inspector[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activePropertyId, setActivePropId] = useState<string>(DEFAULT_PROPERTIES[0].id);
  const [recoveryOffer, setRecoveryOffer] = useState<RecoveryCandidate | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<SyncErrorCode | null>(null);

  const applyData = useCallback((data: AppData) => {
    setAllMeters(data.meters);
    setTariffs(data.tariffs);
    setProperties(data.properties);
    setAllReadings(data.readings);
    setAllPayments(data.payments);
    setAllInspectors(data.inspectors);
    setSettings(data.settings);

    // Выбранный объект сохраняется, если он есть в новых данных (важно после синхронизации)
    setActivePropId(current => {
      if (data.properties.some(p => p.id === current)) return current;
      const preferred = data.properties.find(p => p.isDefault) || data.properties[0];
      return preferred ? preferred.id : current;
    });
  }, []);

  // Открытие хранилища при старте: SQLite на мобильных, AsyncStorage в вебе
  useEffect(() => {
    async function init() {
      try {
        const stored = await repository.init();
        // Демо-данные прежних версий больше не нужны — вычищаем один раз и сохраняем
        const stripped = stripSampleData(stored);
        if (stripped !== stored) await repository.replaceAll(stripped);

        // Чиним историю, испорченную прежними версиями: «было» каждой записи —
        // предыдущая запись, а показание счетчика — последняя запись журнала
        const { data, changedReadings, changedMeters } = repairReadingHistory(stripped);
        for (const entry of changedReadings) await repository.updateReading(entry);
        if (changedMeters.length > 0) await repository.upsertMeters(changedMeters);
        applyData(data);
        // Расписание уведомлений не переживает переустановку приложения — восстанавливаем
        syncReadingReminder(data.settings).catch(() => undefined);
        // Снимки прежних версий ужимаем в фоне, не задерживая запуск
        compressExistingPhotos().catch(() => undefined);

        // Ежедневная зашифрованная копия базы — страховка от любой потери данных
        repository.ensureDailySnapshot().catch(e => console.warn('Копия базы не создана:', e));

        // Основная база пуста, а в копиях или отложенных файлах есть показания —
        // предлагаем вернуть их, а не молча работать с пустой базой
        if (data.readings.length === 0 && data.payments.length === 0) {
          repository
            .listRecoveryCandidates()
            .then(candidates => {
              const best = candidates
                .filter(c => c.readable && (c.readings > 0 || c.payments > 0))
                .sort((a, b) => b.readings - a.readings || b.createdAt - a.createdAt)[0];
              if (best) setRecoveryOffer(best);
            })
            .catch(() => undefined);
        }
      } catch (e) {
        console.error('Не удалось загрузить данные приложения:', e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [applyData]);

  // Виджеты на рабочем столе перерисовываются после изменений данных.
  // Короткая задержка собирает серию правок в одно обновление.
  const widgetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || Platform.OS !== 'android') return;
    if (widgetTimer.current) clearTimeout(widgetTimer.current);
    widgetTimer.current = setTimeout(() => {
      const { updateAllWidgets } = require('../widgets/updateWidgets');
      updateAllWidgets({
        meters: allMeters,
        tariffs,
        properties,
        readings: allReadings,
        payments: allPayments,
        inspectors: allInspectors,
        settings,
      }).catch(() => undefined);
    }, 1000);
    return () => {
      if (widgetTimer.current) clearTimeout(widgetTimer.current);
    };
  }, [loading, allMeters, tariffs, properties, allReadings, allPayments, allInspectors, settings]);

  const language = settings.language;
  const t = useMemo(() => createTranslator(language), [language]);

  const activeProperty = useMemo(() => {
    return properties.find(p => p.id === activePropertyId) || properties[0] || DEFAULT_PROPERTIES[0];
  }, [properties, activePropertyId]);

  // Все экраны работают только с данными выбранного объекта
  const meters = useMemo(
    () => allMeters.filter(m => m.propertyId === activeProperty.id),
    [allMeters, activeProperty.id]
  );

  const readings = useMemo(
    () => allReadings.filter(r => r.propertyId === activeProperty.id).sort(byNewestReading),
    [allReadings, activeProperty.id]
  );

  const payments = useMemo(
    () => allPayments.filter(p => p.propertyId === activeProperty.id).sort(byNewestPayment),
    [allPayments, activeProperty.id]
  );

  const inspectors = useMemo(
    () => allInspectors.filter(i => i.propertyId === activeProperty.id),
    [allInspectors, activeProperty.id]
  );

  const balances = useMemo(() => calculateAllBalances(readings, payments), [readings, payments]);
  const totalDebt = useMemo(() => calculateTotalDebt(readings, payments), [readings, payments]);

  const isDark = settings.theme === 'dark';
  const theme = isDark ? DarkTheme : LightTheme;

  const getTariffForMeter = useCallback(
    (meterType: MeterType) => tariffs.find(tariff => tariff.meterType === meterType),
    [tariffs]
  );

  const getMeterById = useCallback(
    (meterId: string) => allMeters.find(m => m.id === meterId),
    [allMeters]
  );

  /** Синхронизирует состояние счетчиков с историей и сохраняет изменившиеся строки */
  const syncMeterState = useCallback(
    async (currentMeters: Meter[], nextReadings: ReadingEntry[]) => {
      const synced = recomputeMeterState(currentMeters, nextReadings);
      const changed = synced.filter((meter, index) => meter !== currentMeters[index]);

      setAllMeters(synced);
      if (changed.length > 0) {
        await repository.upsertMeters(changed);
      }
    },
    []
  );

  /**
   * Выстраивает «было → стало» для записей одного счетчика и сохраняет
   * записи, у которых поменялось «было». Возвращает обновленный список.
   */
  const applyReadingChain = useCallback(
    async (meterId: string, readingsList: ReadingEntry[]): Promise<ReadingEntry[]> => {
      const meterReadings = readingsList.filter(r => r.meterId === meterId);
      const meterType = meterReadings[0]?.meterType;
      const tariff = tariffs.find(item => item.meterType === meterType);
      const changed = recomputeReadingChain(meterReadings, tariff);
      if (changed.length === 0) return readingsList;

      const changedById = new Map(changed.map(r => [r.id, r]));
      for (const entry of changed) {
        await repository.updateReading(entry);
      }
      return readingsList.map(r => changedById.get(r.id) ?? r);
    },
    [tariffs]
  );

  // ---------- Показания ----------

  const addReading = useCallback(
    async (data: AddReadingInput): Promise<ReadingEntry> => {
      const meter = allMeters.find(m => m.id === data.meterId);
      if (!meter) throw new Error(`Счетчик ${data.meterId} не найден`);

      const tariff = tariffs.find(item => item.meterType === data.meterType);
      const createdAt = new Date().toISOString();
      // «Было» — показание предыдущей по дате записи этого счетчика, а для первой
      // записи — начальное показание. При замене счетчика отсчет идет с нуля.
      const previousReading = data.isReplacement
        ? 0
        : previousReadingFor(
            { date: data.date, createdAt },
            allReadings.filter(r => r.meterId === meter.id),
            meter.currentReading
          );
      const consumption = Math.max(0, data.reading - previousReading);

      const newEntry: ReadingEntry = {
        id: createId('read'),
        meterId: data.meterId,
        meterType: data.meterType,
        propertyId: meter.propertyId,
        date: data.date,
        reading: data.reading,
        previousReading,
        consumption,
        cost: calculateReadingCost(consumption, tariff),
        notes: data.notes,
        createdAt,
        isReplacement: data.isReplacement || undefined,
        photo: data.photo || undefined,
      };

      await repository.insertReading(newEntry);
      // Запись, внесенная задним числом, становится «было» для следующей
      const nextReadings = await applyReadingChain(meter.id, [newEntry, ...allReadings]);
      setAllReadings(nextReadings);
      await syncMeterState(allMeters, nextReadings);

      return nextReadings.find(r => r.id === newEntry.id) ?? newEntry;
    },
    [allMeters, allReadings, tariffs, syncMeterState, applyReadingChain]
  );

  const updateReading = useCallback(
    async (id: string, changes: UpdateReadingInput) => {
      const target = allReadings.find(r => r.id === id);
      if (!target) return;

      const reading = changes.reading ?? target.reading;
      const isReplacement = changes.isReplacement ?? target.isReplacement;
      const previousReading = isReplacement ? 0 : target.previousReading;
      const consumption = Math.max(0, reading - previousReading);
      const tariff = tariffs.find(item => item.meterType === target.meterType);

      const nextPhoto = changes.photo === undefined ? target.photo : changes.photo || undefined;
      if (target.photo && nextPhoto !== target.photo) {
        deletePhoto(target.photo);
      }

      const updatedEntry: ReadingEntry = {
        ...target,
        reading,
        previousReading,
        consumption,
        cost: calculateReadingCost(consumption, tariff),
        date: changes.date ?? target.date,
        notes: changes.notes !== undefined ? changes.notes || undefined : target.notes,
        isReplacement: isReplacement || undefined,
        photo: nextPhoto,
      };

      await repository.updateReading(updatedEntry);
      // Правка значения или даты сдвигает «было» соседних записей
      const nextReadings = await applyReadingChain(
        target.meterId,
        allReadings.map(r => (r.id === id ? updatedEntry : r))
      );
      setAllReadings(nextReadings);
      await syncMeterState(allMeters, nextReadings);
    },
    [allMeters, allReadings, tariffs, syncMeterState, applyReadingChain]
  );

  const deleteReading = useCallback(
    async (id: string) => {
      const target = allReadings.find(r => r.id === id);

      await repository.deleteReading(id);
      if (target?.photo) deletePhoto(target.photo);
      // Следующая запись теперь считается от предыдущей перед удаленной
      let remaining = allReadings.filter(r => r.id !== id);

      // Удалили самую раннюю запись — ее начальная точка переходит к следующей
      if (target && !target.isReplacement) {
        const meterReadings = allReadings.filter(r => r.meterId === target.meterId).sort(byOldestReading);
        const [first, second] = meterReadings;
        if (first?.id === id && second && !second.isReplacement) {
          const consumption = Math.max(0, second.reading - target.previousReading);
          const tariff = tariffs.find(item => item.meterType === second.meterType);
          const inherited: ReadingEntry = {
            ...second,
            previousReading: target.previousReading,
            consumption,
            cost: calculateReadingCost(consumption, tariff),
          };
          await repository.updateReading(inherited);
          remaining = remaining.map(r => (r.id === second.id ? inherited : r));
        }
      }

      const nextReadings = target ? await applyReadingChain(target.meterId, remaining) : remaining;
      setAllReadings(nextReadings);
      await syncMeterState(allMeters, nextReadings);
    },
    [allMeters, allReadings, tariffs, syncMeterState, applyReadingChain]
  );

  // ---------- Платежи ----------

  const addPayment = useCallback(
    async (data: PaymentInput): Promise<Payment> => {
      const newPayment: Payment = {
        id: createId('pay'),
        propertyId: activeProperty.id,
        monthKey: data.monthKey,
        amount: data.amount,
        date: data.date,
        method: data.method,
        meterType: data.meterType,
        notes: data.notes || undefined,
        receiptPhoto: data.receiptPhoto || undefined,
        createdAt: new Date().toISOString(),
      };

      setAllPayments(prev => [newPayment, ...prev]);
      await repository.insertPayment(newPayment);
      return newPayment;
    },
    [activeProperty.id]
  );

  const updatePayment = useCallback(
    async (id: string, changes: PaymentInput) => {
      const target = allPayments.find(p => p.id === id);
      if (!target) return;

      const nextPhoto =
        changes.receiptPhoto === undefined ? target.receiptPhoto : changes.receiptPhoto || undefined;
      if (target.receiptPhoto && nextPhoto !== target.receiptPhoto) {
        deletePhoto(target.receiptPhoto);
      }

      const updated: Payment = {
        ...target,
        monthKey: changes.monthKey,
        amount: changes.amount,
        date: changes.date,
        method: changes.method,
        meterType: changes.meterType,
        notes: changes.notes || undefined,
        receiptPhoto: nextPhoto,
      };

      setAllPayments(prev => prev.map(p => (p.id === id ? updated : p)));
      await repository.updatePayment(updated);
    },
    [allPayments]
  );

  const deletePayment = useCallback(
    async (id: string) => {
      const target = allPayments.find(p => p.id === id);
      setAllPayments(prev => prev.filter(p => p.id !== id));
      await repository.deletePayment(id);
      if (target?.receiptPhoto) deletePhoto(target.receiptPhoto);
    },
    [allPayments]
  );

  // ---------- Инспекторы ----------

  const saveInspector = useCallback(
    async (meterType: MeterType, input: InspectorInput) => {
      const clean = (value?: string) => value?.trim() || undefined;
      const fields = {
        name: clean(input.name),
        organization: clean(input.organization),
        phone: clean(input.phone),
        telegram: clean(input.telegram),
        notes: clean(input.notes),
      };
      const existing = allInspectors.find(
        i => i.propertyId === activeProperty.id && i.meterType === meterType
      );

      // Все поля очищены — запись больше не нужна
      if (!Object.values(fields).some(Boolean)) {
        if (existing) {
          setAllInspectors(prev => prev.filter(i => i.id !== existing.id));
          await repository.deleteInspector(existing.id);
        }
        return;
      }

      const inspector: Inspector = {
        id: existing?.id ?? createId('insp'),
        propertyId: activeProperty.id,
        meterType,
        ...fields,
        updatedAt: new Date().toISOString(),
      };
      setAllInspectors(prev => [...prev.filter(i => i.id !== inspector.id), inspector]);
      await repository.upsertInspector(inspector);
    },
    [allInspectors, activeProperty.id]
  );

  const deleteInspector = useCallback(async (id: string) => {
    setAllInspectors(prev => prev.filter(i => i.id !== id));
    await repository.deleteInspector(id);
  }, []);

  // ---------- Счетчики ----------

  const addMeter = useCallback(
    async (type: MeterType, options: NewMeterOptions = {}): Promise<Meter> => {
      const newMeter = createMeterForProperty(activeProperty.id, type, {
        ...(options.name ? { name: options.name } : {}),
        ...(options.serialNumber ? { serialNumber: options.serialNumber } : {}),
        ...(options.currentReading ? { currentReading: options.currentReading } : {}),
        ...(options.initialDate ? { lastReadingDate: options.initialDate } : {}),
      });

      setAllMeters(prev => [...prev, newMeter]);
      await repository.upsertMeters([newMeter]);
      return newMeter;
    },
    [activeProperty.id]
  );

  const updateMeter = useCallback(async (meter: Meter) => {
    setAllMeters(prev => prev.map(m => (m.id === meter.id ? meter : m)));
    await repository.upsertMeters([meter]);
  }, []);

  const deleteMeter = useCallback(
    async (id: string) => {
      // Показания удаленного счетчика теряют смысл — удаляем вместе с ним
      const removedReadings = allReadings.filter(r => r.meterId === id);

      setAllMeters(prev => prev.filter(m => m.id !== id));
      setAllReadings(prev => prev.filter(r => r.meterId !== id));

      await repository.deleteMeter(id);
      removedReadings.forEach(r => deletePhoto(r.photo));
    },
    [allReadings]
  );

  const setInitialReadings = useCallback(
    async (values: InitialReadingInput[], date: string) => {
      const byId = new Map(values.map(v => [v.meterId, v.reading]));
      // Счетчики с записями в журнале не трогаем: их показание определяет история
      const changed = allMeters
        .filter(m => byId.has(m.id) && !allReadings.some(r => r.meterId === m.id))
        .map(m => ({ ...m, currentReading: byId.get(m.id)!, lastReadingDate: date }));
      if (changed.length === 0) return;

      const changedById = new Map(changed.map(m => [m.id, m]));
      setAllMeters(prev => prev.map(m => changedById.get(m.id) ?? m));
      await repository.upsertMeters(changed);
    },
    [allMeters, allReadings]
  );

  // ---------- Объекты учета ----------

  const addProperty = useCallback(
    async (name: string, address?: string): Promise<Property> => {
      const newProp: Property = {
        id: createId('prop'),
        name,
        address,
        isDefault: false,
      };
      // Новый объект сразу получает полный комплект счетчиков с нулевыми показаниями
      const newMeters = createDefaultMetersForProperty(newProp.id);

      setProperties(prev => [...prev, newProp]);
      setAllMeters(prev => [...prev, ...newMeters]);

      await repository.upsertProperty(newProp);
      await repository.upsertMeters(newMeters);
      return newProp;
    },
    []
  );

  const updateProperty = useCallback(async (property: Property) => {
    setProperties(prev => prev.map(p => (p.id === property.id ? property : p)));
    await repository.upsertProperty(property);
  }, []);

  const deleteProperty = useCallback(
    async (id: string): Promise<boolean> => {
      // Последний объект удалить нельзя — приложению нужен хотя бы один
      if (properties.length <= 1) return false;

      const nextProperties = properties.filter(p => p.id !== id);
      // Если удаляли объект по умолчанию, назначаем новый
      const needsNewDefault = !nextProperties.some(p => p.isDefault);
      if (needsNewDefault) {
        nextProperties[0] = { ...nextProperties[0], isDefault: true };
      }

      const removedPhotos = [
        ...allReadings.filter(r => r.propertyId === id).map(r => r.photo),
        ...allPayments.filter(p => p.propertyId === id).map(p => p.receiptPhoto),
      ];

      setProperties(nextProperties);
      setAllMeters(prev => prev.filter(m => m.propertyId !== id));
      setAllReadings(prev => prev.filter(r => r.propertyId !== id));
      setAllPayments(prev => prev.filter(p => p.propertyId !== id));
      setAllInspectors(prev => prev.filter(i => i.propertyId !== id));
      if (activePropertyId === id) {
        setActivePropId(nextProperties[0].id);
      }

      // Счетчики, показания и платежи уходят каскадом на стороне хранилища
      await repository.deleteProperty(id);
      if (needsNewDefault) {
        await repository.upsertProperty(nextProperties[0]);
      }
      removedPhotos.forEach(photo => deletePhoto(photo));
      return true;
    },
    [properties, allReadings, allPayments, activePropertyId]
  );

  // ---------- Тарифы и настройки ----------

  const updateTariff = useCallback(
    async (tariff: Tariff) => {
      const next = tariffs.map(item =>
        item.id === tariff.id ? { ...tariff, currency: settings.currency } : item
      );
      setTariffs(next);
      await repository.replaceTariffs(next);
    },
    [tariffs, settings.currency]
  );

  /** Возвращает все тарифы к стандартным одной операцией */
  const resetTariffs = useCallback(async () => {
    const next = DEFAULT_TARIFFS.map(tariff => ({ ...tariff, currency: settings.currency }));
    setTariffs(next);
    await repository.replaceTariffs(next);
  }, [settings.currency]);

  const updateSettings = useCallback(
    async (newSettings: Partial<AppSettings>) => {
      const updated: AppSettings = { ...settings, ...newSettings };
      setSettings(updated);
      await repository.saveSettings(updated);

      // Валюта тарифов не должна расходиться с валютой расчетов
      if (newSettings.currency && newSettings.currency !== settings.currency) {
        const nextTariffs = tariffs.map(tariff => ({ ...tariff, currency: updated.currency }));
        setTariffs(nextTariffs);
        await repository.replaceTariffs(nextTariffs);
      }

      // Напоминание пересобираем, только если изменились его параметры
      // Смена языка тоже пересобирает: текст уведомления берется из словаря
      const reminderChanged =
        newSettings.language !== undefined ||
        newSettings.notificationsEnabled !== undefined ||
        newSettings.reminderDay !== undefined ||
        newSettings.reminderHour !== undefined;
      if (reminderChanged) {
        await syncReadingReminder(updated);
      }
    },
    [settings, tariffs]
  );

  // ---------- Данные ----------

  /** Полная замена данных: импорт, сброс. Чистит осиротевшие снимки. */
  const replaceAllData = useCallback(
    async (data: AppData, reason = 'replace') => {
      // Перед заменой всех данных сохраняем копию: ошибку импорта можно отменить
      await repository.createSnapshot(`before${reason}`);
      await repository.replaceAll(data);
      deleteOrphanPhotos(collectPhotoNames(data));
      applyData(data);
      await syncReadingReminder(data.settings);
    },
    [applyData]
  );

  const resetToDefaults = useCallback(async () => {
    await replaceAllData({
      meters: DEFAULT_METERS,
      tariffs: DEFAULT_TARIFFS.map(tariff => ({ ...tariff, currency: settings.currency })),
      properties: DEFAULT_PROPERTIES,
      readings: [],
      payments: [],
      inspectors: [],
      // Язык и тему пользователь выбрал осознанно — сброс данных их не трогает
      settings: { ...DEFAULT_SETTINGS, language: settings.language, theme: settings.theme },
    });
  }, [replaceAllData, settings.currency, settings.language, settings.theme]);

  const importBackupData = useCallback(
    async (jsonStr: string): Promise<boolean> => {
      const data = parseBackup(jsonStr);
      if (!data) return false;
      await replaceAllData(data, 'import');
      return true;
    },
    [replaceAllData]
  );

  // ---------- Облачная синхронизация ----------

  const currentData = useCallback(
    (): AppData => ({
      meters: allMeters,
      tariffs,
      properties,
      readings: allReadings,
      payments: allPayments,
      inspectors: allInspectors,
      settings,
    }),
    [allMeters, tariffs, properties, allReadings, allPayments, allInspectors, settings]
  );

  // Актуальные данные для фоновой синхронизации без пересоздания таймеров
  const dataRef = useRef<AppData | null>(null);
  dataRef.current = loading ? null : currentData();
  const syncInFlight = useRef(false);

  useEffect(() => {
    loadSyncState().then(setSyncState).catch(() => undefined);
  }, []);

  const runSync = useCallback(async (): Promise<void> => {
    const local = dataRef.current;
    if (!isSyncConfigured || !local || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const result = await syncNow(local, repository);
      if (result.data) {
        // Пришли изменения с другого устройства: применяем без очистки снимков
        await repository.replaceAll(result.data);
        applyData(result.data);
      }
      setSyncError(null);
      setSyncState(await loadSyncState());
    } catch (e) {
      setSyncError(e instanceof SyncError ? e.code : 'UNKNOWN');
      if (!(e instanceof SyncError) || e.code === 'UNKNOWN') console.warn('Синхронизация не удалась:', e);
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [applyData]);

  // Автосинхронизация: через 4 с после изменений, при запуске и возврате в приложение
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedIn = !!syncState;
  useEffect(() => {
    if (loading || !signedIn || !isSyncConfigured) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      runSync();
    }, 4000);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [loading, signedIn, allMeters, tariffs, properties, allReadings, allPayments, allInspectors, settings, runSync]);

  useEffect(() => {
    if (!signedIn || !isSyncConfigured) return;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') runSync();
    });
    return () => subscription.remove();
  }, [signedIn, runSync]);

  const cloudSignIn = useCallback(
    async (email: string, password: string) => {
      await syncSignIn(email, password);
      setSyncState(await loadSyncState());
      setSyncError(null);
      await runSync();
    },
    [runSync]
  );

  const cloudSignUp = useCallback(
    async (email: string, password: string) => {
      const result = await syncSignUp(email, password);
      if (result === 'ready') {
        setSyncState(await loadSyncState());
        setSyncError(null);
        await runSync();
      }
      return result;
    },
    [runSync]
  );

  const cloudSignOut = useCallback(async () => {
    await syncSignOut(repository);
    setSyncState(null);
    setSyncError(null);
  }, []);

  const cloudDeleteCopy = useCallback(async () => {
    await deleteCloudCopy(repository);
    setSyncState(await loadSyncState());
  }, []);

  const cloud: CloudStatus = {
    configured: isSyncConfigured,
    signedIn,
    email: syncState?.email ?? null,
    lastSyncedAt: syncState?.lastSyncedAt ?? null,
    syncing,
    error: syncError,
  };

  const listRecoveryCandidates = useCallback(() => repository.listRecoveryCandidates(), []);

  /** Возвращает данные из копии; текущее состояние перед этим тоже сохраняется */
  const restoreFromCandidate = useCallback(
    async (name: string) => {
      const restored = normalizeAppData(await repository.readRecoveryCandidate(name));
      await replaceAllData(restored, 'restore');
      setRecoveryOffer(null);
    },
    [replaceAllData]
  );

  const dismissRecoveryOffer = useCallback(() => setRecoveryOffer(null), []);

  const exportBackupData = useCallback(async () => {
    return serializeBackup({
      meters: allMeters,
      tariffs,
      properties,
      readings: allReadings,
      payments: allPayments,
      inspectors: allInspectors,
      settings,
    });
  }, [allMeters, tariffs, properties, allReadings, allPayments, allInspectors, settings]);

  const value: AppContextValue = {
    loading,
    language,
    t,
    meters,
    readings,
    payments,
    inspectors,
    balances,
    totalDebt,
    allMeters,
    allReadings,
    allPayments,
    tariffs,
    properties,
    settings,
    activeProperty,
    theme,
    isDark,
    storageBackend: repository.backend,
    setActivePropertyId: setActivePropId,
    addProperty,
    updateProperty,
    deleteProperty,
    addMeter,
    updateMeter,
    deleteMeter,
    setInitialReadings,
    addReading,
    updateReading,
    deleteReading,
    saveInspector,
    deleteInspector,
    addPayment,
    updatePayment,
    deletePayment,
    updateTariff,
    resetTariffs,
    updateSettings,
    resetToDefaults,
    importBackupData,
    exportBackupData,
    cloud,
    cloudSignIn,
    cloudSignUp,
    cloudSignOut,
    cloudSyncNow: runSync,
    cloudDeleteCopy,
    recoveryOffer,
    dismissRecoveryOffer,
    listRecoveryCandidates,
    restoreFromCandidate,
    getTariffForMeter,
    getMeterById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
