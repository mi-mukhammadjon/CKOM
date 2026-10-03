import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { compressBackup, decodeBackup } from '../utils/backupCodec';

export interface ShareResult {
  shared: boolean;
  /** Путь к файлу — показываем пользователю, если системное меню «Поделиться» недоступно */
  uri: string;
}

const BACKUP_PREFIX = 'ckom-backup-';

function buildFileName(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `${BACKUP_PREFIX}${stamp}.json.gz`;
}

/**
 * Удаляет копии резервных файлов, оставшиеся внутри приложения после отправки.
 * Прежние версии складывали открытый JSON в документы — там он больше не нужен.
 */
function removeLocalBackupCopies(): void {
  for (const dir of [Paths.document, Paths.cache]) {
    try {
      for (const entry of new Directory(dir).list()) {
        if (entry instanceof File && entry.name.startsWith(BACKUP_PREFIX)) entry.delete();
      }
    } catch (e) {
      console.warn('Не удалось очистить старые резервные копии:', e);
    }
  }
}

/**
 * Записывает сжатую резервную копию во временный файл и открывает системное меню
 * «Поделиться», чтобы пользователь сохранил ее в Telegram, Google Drive или в Файлы.
 */
export async function shareBackupFile(json: string, dialogTitle: string): Promise<ShareResult> {
  removeLocalBackupCopies();

  const file = new File(Paths.cache, buildFileName());
  file.create({ overwrite: true });
  file.write(compressBackup(json));

  const canShare = Platform.OS !== 'web' && (await Sharing.isAvailableAsync());
  if (!canShare) {
    return { shared: false, uri: file.uri };
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/gzip',
    dialogTitle,
    UTI: 'org.gnu.gnu-zip-archive',
  });

  return { shared: true, uri: file.uri };
}

/**
 * Открывает системный выбор файла и возвращает JSON выбранной резервной копии.
 * Принимает и сжатые копии, и обычные JSON-файлы прежних версий.
 * Возвращает null, если пользователь отменил выбор.
 */
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/gzip', 'application/x-gzip', 'application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  const file = new File(result.assets[0].uri);
  try {
    return decodeBackup(await file.bytes());
  } finally {
    // Копия, сделанная выбором файла, внутри приложения не нужна
    try {
      if (file.exists) file.delete();
    } catch {
      // файл мог быть только для чтения — не критично
    }
  }
}
