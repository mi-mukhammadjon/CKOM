import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/** Подпапка в документах приложения, где лежат снимки счетчиков и квитанций */
const PHOTO_DIR_NAME = 'ckom-photos';

export type PhotoSource = 'camera' | 'library';

/** Длинная сторона снимка после сжатия: цифры счетчика и квитанции читаются уверенно */
const MAX_PHOTO_SIDE = 1600;
const JPEG_QUALITY = 0.7;
/** Снимки меньше этого размера уже достаточно компактны */
const COMPRESS_THRESHOLD_BYTES = 350 * 1024;
const PHOTOS_COMPRESSED_FLAG = '@ckom_photos_compressed_v1';

/**
 * Уменьшает снимок до MAX_PHOTO_SIDE по длинной стороне и пересохраняет в JPEG.
 * Возвращает временный файл с результатом.
 */
async function compressImage(uri: string): Promise<File> {
  const context = ImageManipulator.manipulate(uri);
  const probe = await context.renderAsync();
  const longest = Math.max(probe.width, probe.height);
  if (longest > MAX_PHOTO_SIDE) {
    context.resize(
      probe.width >= probe.height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE }
    );
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return new File(result.uri);
}

export type PhotoResult =
  | { status: 'saved'; fileName: string }
  | { status: 'canceled' }
  | { status: 'denied'; source: PhotoSource }
  | { status: 'unsupported' }
  | { status: 'failed' };

function photoDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Абсолютный URI снимка по имени файла; null, если файла нет */
export function getPhotoUri(fileName?: string): string | null {
  if (!fileName || Platform.OS === 'web') return null;
  try {
    const file = new File(Paths.document, PHOTO_DIR_NAME, fileName);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

function buildFileName(extension: string): string {
  const safeExtension = /^[a-z0-9]{1,5}$/i.test(extension) ? extension.toLowerCase() : 'jpg';
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExtension}`;
}

/**
 * Открывает камеру или галерею и копирует выбранный снимок в документы приложения.
 * Возвращается имя файла — в базе хранится только оно, чтобы данные не зависели
 * от абсолютных путей, которые меняются при переустановке приложения.
 */
export async function capturePhoto(source: PhotoSource): Promise<PhotoResult> {
  if (Platform.OS === 'web') return { status: 'unsupported' };

  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) return { status: 'denied', source };

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      // Снимок счетчика нужен как доказательство, а не как обои — сжимаем,
      // чтобы резервная копия и память устройства не разрастались
      // Качество задаем при собственном сжатии, здесь берем исходник без потерь
      quality: 1,
      exif: false,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.length) return { status: 'canceled' };

    const asset = result.assets[0];
    const compressed = await compressImage(asset.uri);
    const fileName = buildFileName('jpg');
    const target = new File(photoDirectory(), fileName);

    await compressed.move(target);
    return { status: 'saved', fileName };
  } catch (e) {
    console.warn('Не удалось сохранить фотографию:', e);
    return { status: 'failed' };
  }
}

/** Удаляет снимок, если он есть. Ошибки игнорируются: отсутствие файла не проблема. */
export function deletePhoto(fileName?: string): void {
  if (!fileName || Platform.OS === 'web') return;
  try {
    const file = new File(Paths.document, PHOTO_DIR_NAME, fileName);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('Не удалось удалить фотографию:', e);
  }
}

/**
 * Удаляет снимки, на которые больше никто не ссылается.
 * Вызывается после импорта бэкапа, сброса и загрузки демо-данных.
 */
export function deleteOrphanPhotos(referenced: Iterable<string>): void {
  if (Platform.OS === 'web') return;
  try {
    const keep = new Set(referenced);
    const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
    if (!dir.exists) return;

    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        entry.delete();
      }
    }
  } catch (e) {
    console.warn('Не удалось очистить неиспользуемые фотографии:', e);
  }
}

/**
 * Однократно сжимает снимки, сохраненные прежними версиями без уменьшения.
 * Имя файла не меняется, чтобы ссылки в базе остались прежними.
 */
export async function compressExistingPhotos(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if ((await AsyncStorage.getItem(PHOTOS_COMPRESSED_FLAG)) === 'true') return;

    const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
    if (dir.exists) {
      for (const entry of dir.list()) {
        if (!(entry instanceof File) || (entry.size ?? 0) < COMPRESS_THRESHOLD_BYTES) continue;
        try {
          const compressed = await compressImage(entry.uri);
          if ((compressed.size ?? 0) > 0 && (compressed.size ?? 0) < (entry.size ?? 0)) {
            // Сначала кладем сжатую копию рядом: если что-то пойдет не так,
            // исходный снимок останется на месте
            const name = entry.name;
            const temp = new File(dir, `${name}.tmp`);
            if (temp.exists) temp.delete();
            await compressed.move(temp);
            entry.delete();
            temp.rename(name);
          } else {
            compressed.delete();
          }
        } catch (e) {
          console.warn('Не удалось сжать снимок', entry.name, e);
        }
      }
    }

    await AsyncStorage.setItem(PHOTOS_COMPRESSED_FLAG, 'true');
  } catch (e) {
    console.warn('Не удалось сжать сохраненные снимки:', e);
  }
}
