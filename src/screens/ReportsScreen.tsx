import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import type { TranslationKey } from '../i18n';
import {
  buildReport,
  PERIOD_PRESETS,
  PeriodPreset,
  REPORT_TYPES,
  ReportPeriod,
  ReportTable,
  ReportType,
  resolvePeriod,
} from '../reports/build';
import { reportToText } from '../reports/format';
import { exportReportCsv, exportReportPdf, shareReportText } from '../reports/export';
import { getCurrentMonthKey, getMonthTitle } from '../utils/calculator';
import { getMeterTypeLabel } from '../utils/meters';
import { getTelegramLink } from '../utils/inspectors';
import { openInspectorLink } from '../components/InspectorsSection';
import { appError, appSuccess } from '../components/AppDialog';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<ReportType, IconName> = {
  summary: 'pie-chart-outline',
  monthly: 'calendar-outline',
  readings: 'list-outline',
  payments: 'wallet-outline',
  inspector: 'paper-plane-outline',
};

/** В предпросмотре показываем первые строки — полностью таблица уходит в PDF и Excel */
const PREVIEW_ROWS = 25;

export const ReportsScreen: React.FC = () => {
  const { theme, meters, readings, payments, inspectors, activeProperty, settings, t } = useApp();

  const [type, setType] = useState<ReportType>('summary');
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [inspectorMonth, setInspectorMonth] = useState(getCurrentMonthKey());
  const [busy, setBusy] = useState<'pdf' | 'csv' | 'text' | null>(null);

  // Месяцы для отчета инспектору: текущий и все месяцы с показаниями
  const months = useMemo(() => {
    const set = new Set([getCurrentMonthKey(), ...readings.map(r => r.date.slice(0, 7))]);
    return [...set].sort().reverse().slice(0, 12);
  }, [readings]);

  const period: ReportPeriod =
    type === 'inspector'
      ? { from: inspectorMonth, to: inspectorMonth }
      : resolvePeriod(preset, readings);

  const report = useMemo(
    () =>
      buildReport({
        type,
        period,
        propertyName: activeProperty.name,
        meters,
        readings,
        payments,
        currency: settings.currency,
        t,
      }),
    // period пересчитывается из type/preset/inspectorMonth
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, preset, inspectorMonth, activeProperty.name, meters, readings, payments, settings.currency, t]
  );

  const run = async (kind: 'pdf' | 'csv' | 'text', action: () => Promise<void>) => {
    try {
      setBusy(kind);
      await action();
    } catch (e) {
      console.warn('Экспорт отчета не удался', e);
      appError(t('common.error'), t('reports.exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    await Clipboard.setStringAsync(reportToText(report));
    appSuccess(t('reports.copied'));
  };

  const reachableInspectors = inspectors
    .map(inspector => ({ inspector, link: getTelegramLink(inspector) }))
    .filter((item): item is { inspector: (typeof inspectors)[number]; link: string } => !!item.link);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>{t('reports.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('reports.subtitle')}</Text>

        {/* Вид отчета */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('reports.sectionType')}</Text>
        <View style={styles.typeGrid}>
          {REPORT_TYPES.map(item => {
            const selected = item === type;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.typeCard,
                  {
                    backgroundColor: selected ? theme.badgeBg : theme.card,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setType(item)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.typeIcon,
                    { backgroundColor: selected ? theme.primary : theme.surfaceLight },
                  ]}
                >
                  <Ionicons
                    name={TYPE_ICONS[item]}
                    size={18}
                    color={selected ? theme.onPrimary : theme.textSecondary}
                  />
                </View>
                <Text style={[styles.typeTitle, { color: theme.text }]} numberOfLines={1}>
                  {t(`reports.type.${item}` as TranslationKey)}
                </Text>
                <Text style={[styles.typeHint, { color: theme.textSecondary }]} numberOfLines={2}>
                  {t(`reports.typeHint.${item}` as TranslationKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Период */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('reports.sectionPeriod')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {type === 'inspector'
            ? months.map(month => (
                <Chip
                  key={month}
                  label={getMonthTitle(month, t)}
                  selected={month === inspectorMonth}
                  onPress={() => setInspectorMonth(month)}
                />
              ))
            : PERIOD_PRESETS.map(item => (
                <Chip
                  key={item}
                  label={t(`reports.period.${item}` as TranslationKey)}
                  selected={item === preset}
                  onPress={() => setPreset(item)}
                />
              ))}
        </ScrollView>

        {/* Предпросмотр */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('reports.sectionPreview')}</Text>
        <View style={[styles.preview, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.previewTitle, { color: theme.text }]}>{report.title}</Text>
          <Text style={[styles.previewMeta, { color: theme.textSecondary }]}>
            {report.propertyName} · {report.periodLabel}
          </Text>

          <View style={styles.kpiGrid}>
            {report.kpis.map(kpi => (
              <View key={kpi.label} style={[styles.kpi, { backgroundColor: theme.surfaceLight }]}>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                  {kpi.label}
                </Text>
                <Text
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        kpi.tone === 'bad' ? theme.danger : kpi.tone === 'good' ? theme.success : theme.text,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {kpi.value}
                </Text>
                {kpi.hint ? (
                  <Text
                    style={[
                      styles.kpiHint,
                      {
                        color:
                          kpi.hintTone === 'bad'
                            ? theme.danger
                            : kpi.hintTone === 'good'
                            ? theme.success
                            : theme.textMuted,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {kpi.hint}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          {report.bars.length > 0 && (
            <View style={styles.bars}>
              <View style={styles.barTrack}>
                {report.bars.map(bar => (
                  <View key={bar.label} style={{ flex: Math.max(1, bar.share * 100), backgroundColor: bar.color }} />
                ))}
              </View>
              {report.bars.map(bar => (
                <View key={bar.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: bar.color }]} />
                  <Text style={[styles.legendText, { color: theme.text }]}>{bar.label}</Text>
                  <Text style={[styles.legendValue, { color: theme.textSecondary }]}>
                    {bar.value} · {Math.round(bar.share * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {report.empty ? (
            <View style={styles.empty}>
              <Ionicons name="document-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('reports.empty')}</Text>
            </View>
          ) : (
            report.tables.map((table, index) => <PreviewTable key={index} table={table} />)
          )}

          {report.text && !report.empty ? (
            <View style={[styles.textBox, { backgroundColor: theme.surfaceLight }]}>
              <Text style={[styles.textBody, { color: theme.text }]}>{report.text}</Text>
            </View>
          ) : null}

          {type === 'inspector' && reachableInspectors.length > 0 && (
            <View style={styles.inspectors}>
              {reachableInspectors.map(({ inspector, link }) => (
                <TouchableOpacity
                  key={inspector.id}
                  style={[styles.telegramBtn, { backgroundColor: '#229ED9' }]}
                  onPress={async () => {
                    await Clipboard.setStringAsync(reportToText(report));
                    openInspectorLink(link, t('inspectors.openFailed'), t('common.error'));
                  }}
                >
                  <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  <Text style={styles.telegramText}>
                    {t('history.openInspectorChat', { type: getMeterTypeLabel(inspector.meterType, t) })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Экспорт */}
      <View style={[styles.actions, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <ActionButton
          icon="document-text-outline"
          label={t('reports.export.pdf')}
          primary
          busy={busy === 'pdf'}
          disabled={!!busy}
          onPress={() => run('pdf', () => exportReportPdf(report, t))}
        />
        <ActionButton
          icon="grid-outline"
          label={t('reports.export.excel')}
          busy={busy === 'csv'}
          disabled={!!busy}
          onPress={() => run('csv', () => exportReportCsv(report, t))}
        />
        <ActionButton
          icon="share-social-outline"
          label={t('reports.export.text')}
          busy={busy === 'text'}
          disabled={!!busy}
          onPress={() => run('text', () => shareReportText(report))}
          onLongPress={copyText}
        />
      </View>
    </View>
  );
};

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({
  label,
  selected,
  onPress,
}) => {
  const { theme } = useApp();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surfaceLight,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const ActionButton: React.FC<{
  icon: IconName;
  label: string;
  primary?: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}> = ({ icon, label, primary, busy, disabled, onPress, onLongPress }) => {
  const { theme } = useApp();
  const color = primary ? theme.onPrimary : theme.text;
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: primary ? theme.primary : theme.surfaceLight, opacity: disabled && !busy ? 0.6 : 1 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={18} color={color} />}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const FIRST_COL = 132;
const COL = 104;

const PreviewTable: React.FC<{ table: ReportTable }> = ({ table }) => {
  const { theme, t } = useApp();
  const rows = table.rows.slice(0, PREVIEW_ROWS);
  const hidden = table.rows.length - rows.length;

  const cell = (text: string, index: number, align?: 'left' | 'right', bold?: boolean) => (
    <Text
      key={index}
      style={[
        styles.cell,
        {
          width: index === 0 ? FIRST_COL : COL,
          textAlign: align === 'right' ? 'right' : 'left',
          color: theme.text,
          fontFamily: bold ? font.bold : font.regular,
        },
      ]}
      numberOfLines={2}
    >
      {text}
    </Text>
  );

  return (
    <View style={styles.tableBlock}>
      {table.title ? <Text style={[styles.tableTitle, { color: theme.text }]}>{table.title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, { borderBottomColor: theme.text }]}>
            {table.columns.map((c, i) => (
              <Text
                key={c.key}
                style={[
                  styles.headCell,
                  {
                    width: i === 0 ? FIRST_COL : COL,
                    textAlign: c.align === 'right' ? 'right' : 'left',
                    color: theme.textSecondary,
                  },
                ]}
                numberOfLines={2}
              >
                {c.label}
              </Text>
            ))}
          </View>
          {rows.map((row, r) => (
            <View
              key={r}
              style={[
                styles.row,
                { borderBottomColor: theme.borderLight },
                r % 2 === 1 && { backgroundColor: theme.surfaceLight },
              ]}
            >
              {table.columns.map((c, i) => cell(row[c.key] ?? '', i, c.align))}
            </View>
          ))}
          {table.footer && (
            <View style={[styles.row, styles.footerRow, { borderTopColor: theme.text }]}>
              {table.columns.map((c, i) => cell(table.footer?.[c.key] ?? '', i, c.align, true))}
            </View>
          )}
        </View>
      </ScrollView>
      {hidden > 0 ? (
        <Text style={[styles.moreRows, { color: theme.textMuted }]}>
          {t('reports.moreRows', { count: hidden })}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: font.bold,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    lineHeight: 20,
    marginTop: 4,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 12,
    gap: 6,
  },
  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  typeHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 16,
  },
  chips: {
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  preview: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
  },
  previewTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  previewMeta: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.md,
    padding: 10,
  },
  kpiLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  kpiValue: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  kpiHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  bars: {
    marginTop: 14,
    gap: 6,
  },
  barTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.medium,
  },
  legendValue: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    fontVariant: ['tabular-nums'],
  },
  tableBlock: {
    marginTop: 16,
  },
  tableTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  footerRow: {
    borderTopWidth: 1.5,
    borderBottomWidth: 0,
  },
  headCell: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  cell: {
    fontSize: fontSize.xs,
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontVariant: ['tabular-nums'],
  },
  moreRows: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlign: 'center',
  },
  textBox: {
    marginTop: 14,
    borderRadius: radius.md,
    padding: 12,
  },
  textBody: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 18,
  },
  inspectors: {
    marginTop: 12,
    gap: 8,
  },
  telegramBtn: {
    ...button.md,
  },
  telegramText: {
    ...buttonText.md,
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    ...button.md,
    flex: 1,
    paddingHorizontal: 8,
  },
  actionText: {
    ...buttonText.md,
  },
});
