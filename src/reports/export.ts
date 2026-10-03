import { Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import type { Translate } from '../i18n';
import { Report } from './build';
import { reportToCsv, reportToHtml, reportToText } from './format';

const FILE_PREFIX = 'ckom-report-';

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function fileName(report: Report, extension: string): string {
  // Пробелы, тире и знаки, недопустимые в именах файлов, заменяем дефисом
  const safePeriod = report.periodLabel.replace(/[\s—–·/\\:*?"<>|]+/g, '-').replace(/^-|-$/g, '');
  return `${FILE_PREFIX}${report.type}-${safePeriod}.${extension}`;
}

/** Временные файлы прошлых отчетов внутри приложения не копим */
function removeOldReportFiles(): void {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && entry.name.startsWith(FILE_PREFIX)) entry.delete();
    }
  } catch {
    // кэш недоступен — не мешает экспорту
  }
}

/** PDF-отчет: верстка HTML → PDF на устройстве, затем меню «Поделиться» */
export async function exportReportPdf(report: Report, t: Translate): Promise<void> {
  const html = reportToHtml(report, t, stamp());

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  removeOldReportFiles();
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, fileName(report, 'pdf'));
  if (target.exists) target.delete();
  await new File(uri).move(target);

  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: report.title,
  });
}

/** Таблица для Excel (CSV) через меню «Поделиться» */
export async function exportReportCsv(report: Report, t: Translate): Promise<void> {
  removeOldReportFiles();
  const target = new File(Paths.cache, fileName(report, 'csv'));
  target.create({ overwrite: true });
  target.write(reportToCsv(report, t));

  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available');
  }
  await Sharing.shareAsync(target.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: report.title,
  });
}

/** Текст отчета в любой мессенджер */
export async function shareReportText(report: Report): Promise<void> {
  await Share.share({ message: reportToText(report), title: report.title });
}
