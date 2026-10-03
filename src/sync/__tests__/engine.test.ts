/**
 * Сценарии синхронизации двух устройств на поддельном сервере в памяти,
 * который ведет себя как таблица mockVaults в Supabase (включая проверку версии).
 */
import { AppData, ReadingEntry } from '../../types';

// ---------- Подмена окружения: у каждого «устройства» свои хранилища ----------

type Store = Map<string, string>;
const mockDevices: Record<string, { async: Store; secure: Store; meta: Store }> = {};
let mockCurrent = 'phone';
const mockDevice = () => (mockDevices[mockCurrent] ??= { async: new Map(), secure: new Map(), meta: new Map() });

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (k: string) => mockDevice().async.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockDevice().async.set(k, v),
  removeItem: async (k: string) => void mockDevice().async.delete(k),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockDevice().secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockDevice().secure.set(k, v),
  deleteItemAsync: async (k: string) => void mockDevice().secure.delete(k),
}));
let mockSeed = 1;
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, () => (mockSeed = (mockSeed * 48271) % 2147483647) & 255),
}));
// Меньше итераций в тестах — скорость; логика та же
jest.mock('../crypto', () => ({ ...jest.requireActual('../crypto'), VAULT_KDF_ITERATIONS: 1000 }));

// Поддельный Supabase: пользователи, сессия устройства и таблица mockVaults
const mockUsers = new Map<string, { id: string; password: string }>();
const mockSessions: Record<string, string | null> = {};
const mockVaults = new Map<string, Record<string, any>>();

function mockTable() {
  const filters: [string, unknown][] = [];
  const match = (row: Record<string, any>) => filters.every(([k, v]) => row[k] === v);
  const api: any = {
    select: () => api,
    eq: (k: string, v: unknown) => (filters.push([k, v]), api),
    maybeSingle: async () => ({ data: [...mockVaults.values()].find(match) ?? null, error: null }),
    insert: async (row: Record<string, any>) => {
      if (mockVaults.has(row.user_id)) return { error: { message: 'duplicate key' } };
      mockVaults.set(row.user_id, { ...row });
      return { error: null };
    },
    update: (patch: Record<string, any>) => ({
      eq: (k1: string, v1: unknown) => ({
        eq: (k2: string, v2: unknown) => ({
          select: async () => {
            const rows = [...mockVaults.values()].filter(r => r[k1] === v1 && r[k2] === v2);
            rows.forEach(r => Object.assign(r, patch));
            return { data: rows.map(r => ({ version: r.version })), error: null };
          },
        }),
      }),
    }),
    delete: () => ({ eq: async (k: string, v: unknown) => (mockVaults.forEach((r, id) => r[k] === v && mockVaults.delete(id)), { error: null }) }),
  };
  return api;
}

jest.mock('../supabase', () => ({
  isSyncConfigured: true,
  getSupabase: () => ({
    from: () => mockTable(),
    auth: {
      getSession: async () => ({
        data: { session: mockSessions[mockCurrent] ? { user: { id: mockSessions[mockCurrent] } } : null },
      }),
      signUp: async ({ email, password }: { email: string; password: string }) => {
        if (mockUsers.has(email)) return { data: {}, error: { message: 'User already registered' } };
        const id = `user-${mockUsers.size + 1}`;
        mockUsers.set(email, { id, password });
        mockSessions[mockCurrent] = id;
        return { data: { session: {} }, error: null };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const user = mockUsers.get(email);
        if (!user || user.password !== password) return { error: { message: 'Invalid login credentials' } };
        mockSessions[mockCurrent] = user.id;
        return { error: null };
      },
      signOut: async () => void (mockSessions[mockCurrent] = null),
    },
  }),
}));

import { signIn, signUp, syncNow, SyncError } from '../engine';
import { cleanAppData } from '../../services/normalize';
import { AppRepository } from '../../services/db/types';

const repository = {
  getMeta: async (k: string) => mockDevice().meta.get(k) ?? null,
  setMeta: async (k: string, v: string | null) => void (v === null ? mockDevice().meta.delete(k) : mockDevice().meta.set(k, v)),
} as unknown as AppRepository;

function reading(id: string, value: number): ReadingEntry {
  return {
    id,
    meterId: 'meter-gas-prop-1',
    meterType: 'gas',
    propertyId: 'prop-1',
    date: '2026-10-01',
    reading: value,
    previousReading: 100,
    consumption: value - 100,
    cost: (value - 100) * 650,
    createdAt: `2026-10-01T10:00:00.${id.length}Z`,
  };
}

const withReadings = (readings: ReadingEntry[]): AppData => ({ ...cleanAppData(), readings });

beforeEach(() => {
  Object.keys(mockDevices).forEach(k => delete mockDevices[k]);
  mockUsers.clear();
  mockVaults.clear();
  Object.keys(mockSessions).forEach(k => delete mockSessions[k]);
  mockCurrent = 'phone';
});

describe('синхронизация двух устройств', () => {
  it('сервер хранит только шифротекст', async () => {
    await signUp('me@mail.uz', 'Parol-123');
    await syncNow(withReadings([reading('a', 150)]), repository);

    const row = [...mockVaults.values()][0];
    expect(row.ciphertext).not.toContain('meter-gas');
    // В Supabase уходит не пароль, а производный секрет
    expect(mockUsers.get('me@mail.uz')?.password).not.toBe('Parol-123');
  });

  it('второе устройство получает данные первого', async () => {
    await signUp('me@mail.uz', 'Parol-123');
    await syncNow(withReadings([reading('a', 150)]), repository);

    mockCurrent = 'web';
    await signIn('me@mail.uz', 'Parol-123');
    const result = await syncNow(cleanAppData(), repository);
    expect(result.data?.readings.map(r => r.id)).toEqual(['a']);
  });

  it('параллельные изменения на двух устройствах сливаются без потерь', async () => {
    await signUp('me@mail.uz', 'Parol-123');
    const shared = withReadings([reading('a', 150)]);
    await syncNow(shared, repository);

    mockCurrent = 'web';
    await signIn('me@mail.uz', 'Parol-123');
    await syncNow(cleanAppData(), repository);
    // веб добавил свою запись и отправил
    await syncNow(withReadings([reading('a', 150), reading('web', 170)]), repository);

    // телефон тем временем добавил свою, не видя веб
    mockCurrent = 'phone';
    const result = await syncNow(withReadings([reading('a', 150), reading('phone', 160)]), repository);
    expect(result.status).toBe('merged');
    expect(result.data?.readings.map(r => r.id).sort()).toEqual(['a', 'phone', 'web']);
  });

  it('удаление на одном устройстве доходит до другого', async () => {
    await signUp('me@mail.uz', 'Parol-123');
    await syncNow(withReadings([reading('a', 150), reading('b', 160)]), repository);

    mockCurrent = 'web';
    await signIn('me@mail.uz', 'Parol-123');
    await syncNow(cleanAppData(), repository);
    await syncNow(withReadings([reading('a', 150)]), repository); // удалили «b»

    mockCurrent = 'phone';
    const result = await syncNow(withReadings([reading('a', 150), reading('b', 160)]), repository);
    expect(result.status).toBe('pulled');
    expect(result.data?.readings.map(r => r.id)).toEqual(['a']);
  });

  it('неверный пароль не открывает облачную копию', async () => {
    await signUp('me@mail.uz', 'Parol-123');
    await syncNow(withReadings([reading('a', 150)]), repository);

    mockCurrent = 'web';
    await expect(signIn('me@mail.uz', 'boshqa-parol')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('без входа синхронизация не выполняется', async () => {
    await expect(syncNow(cleanAppData(), repository)).rejects.toBeInstanceOf(SyncError);
  });
});
