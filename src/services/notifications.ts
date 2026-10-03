import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AppSettings, Language } from '../types';
import { translate } from '../i18n';

const REMINDER_IDENTIFIER = 'ckom-monthly-reading-reminder';
const ANDROID_CHANNEL_ID = 'ckom-reminders';

/** Показывать баннер, даже когда приложение открыто (в веб-сборке не применимо) */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(language: Language): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: translate(language, 'notification.channel'),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Запрашивает разрешение на уведомления. Возвращает true, если разрешение есть.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Снимает ранее запланированное напоминание */
export async function cancelReadingReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  } catch {
    // Уведомление не было запланировано — ничего делать не нужно
  }
}

/**
 * Пересобирает ежемесячное напоминание о сдаче показаний согласно настройкам.
 * Возвращает true, если напоминание действительно запланировано.
 */
export async function syncReadingReminder(settings: AppSettings): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await cancelReadingReminder();
  if (!settings.notificationsEnabled) return false;

  const granted = await requestNotificationPermission();
  if (!granted) return false;

  await ensureAndroidChannel(settings.language);

  const day = Math.min(Math.max(Math.round(settings.reminderDay) || 25, 1), 28);
  const hour = Math.min(Math.max(Math.round(settings.reminderHour ?? 10), 0), 23);

  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: translate(settings.language, 'notification.title'),
      body: translate(settings.language, 'notification.body', { day }),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day,
      hour,
      minute: 0,
      channelId: ANDROID_CHANNEL_ID,
    },
  });

  return true;
}

/** Дата следующего срабатывания напоминания (null, если не запланировано) */
export async function getNextReminderDate(): Promise<Date | null> {
  if (Platform.OS === 'web') return null;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminder = scheduled.find(n => n.identifier === REMINDER_IDENTIFIER);
  if (!reminder) return null;

  try {
    const next = await Notifications.getNextTriggerDateAsync(reminder.trigger as any);
    return next ? new Date(next) : null;
  } catch {
    return null;
  }
}
