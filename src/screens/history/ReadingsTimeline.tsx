import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { MeterType, ReadingEntry } from '../../types';
import { getPhotoUri } from '../../services/photos';
import { formatCurrency, formatDate, formatNumber, getMeterUnitLabel, getMonthTitle } from '../../utils/calculator';
import { getMeterIcon, getMeterTypeShortLabel, resolveMeterName } from '../../utils/meters';
import { buildHistoryBars, buildHistoryMonths, formatCompact, HistoryMonth, HistoryRow } from '../../utils/history';
import { METER_TYPE_ORDER } from '../../constants/defaults';
import { font, fontSize, radius } from '../../constants/theme';
import { TranslationKey } from '../../i18n';

/** Заметным считается изменение расхода от 15% — меньшее не подсвечиваем */
const NOTICEABLE_CHANGE = 0.15;

interface ReadingsTimelineProps {
  onEdit: (reading: ReadingEntry) => void;
  onDelete: (reading: ReadingEntry) => void;
  onPreviewPhoto: (uri: string) => void;
  /** Скопировать сводку месяца для инспектора */
  onSendMonth: (monthKey: string) => void;
  onOpenReports?: () => void;
}

/**
 * Журнал показаний: график по месяцам, затем показания, сгруппированные
 * по месяцам с итогом и сравнением с прошлым месяцем. Строка показания
 * раскрывается по нажатию — там «было → стало», примечание, фото и действия.
 */
export const ReadingsTimeline: React.FC<ReadingsTimelineProps> = ({
  onEdit,
  onDelete,
  onPreviewPhoto,
  onSendMonth,
  onOpenReports,
}) => {
  const { theme, readings, meters, settings, t } = useApp();
  const [meterType, setMeterType] = useState<string>('all');
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const compareBy = meterType === 'all' ? 'cost' : 'consumption';
  const typeReadings = useMemo(
    () => (meterType === 'all' ? readings : readings.filter(r => r.meterType === meterType)),
    [readings, meterType]
  );
  const months = useMemo(
    () => buildHistoryMonths(readings, typeReadings, compareBy),
    [readings, typeReadings, compareBy]
  );
  const bars = useMemo(() => buildHistoryBars(months, compareBy), [months, compareBy]);
  const visibleMonths = focusedMonth ? months.filter(m => m.monthKey === focusedMonth) : months;

  const typeColor =
    meterType === 'all'
      ? theme.primary
      : meters.find(m => m.type === meterType)?.color || theme.primary;
  const unit = meterType === 'all' ? '' : getMeterUnitLabel(meterType as MeterType, t);

  const formatMetric = (value: number) =>
    compareBy === 'cost' ? formatCurrency(value, settings.currency) : `${formatNumber(value)} ${unit}`;

  const filledBars = bars.filter(b => b.value > 0);
  const average = filledBars.length ? filledBars.reduce((s, b) => s + b.value, 0) / filledBars.length : 0;
  const maxBar = Math.max(1, ...bars.map(b => b.value));
  const highlighted = focusedMonth ?? bars[bars.length - 1]?.monthKey;

  const resourceTabs = [
    { id: 'all', label: t('common.all'), icon: 'apps-outline', color: theme.primary },
    ...METER_TYPE_ORDER.map(type => ({
      id: type,
      label: getMeterTypeShortLabel(type, t),
      icon: getMeterIcon(type),
      color: meters.find(m => m.type === type)?.color || theme.primary,
    })),
  ];

  const monthShort = (monthKey: string) =>
    t(`monthShort.${parseInt(monthKey.slice(5, 7), 10)}` as TranslationKey);

  const toggleMonth = (monthKey: string) => setFocusedMonth(prev => (prev === monthKey ? null : monthKey));

  return (
    <View>
      {/* Заголовок */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>{t('history.title')}</Text>
        {onOpenReports && (
          <TouchableOpacity
            style={[styles.reportBtn, { backgroundColor: theme.badgeBg }]}
            onPress={onOpenReports}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={16} color={theme.primary} />
            <Text style={[styles.reportBtnText, { color: theme.primary }]}>{t('history.reportBtn')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Ресурс */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {resourceTabs.map(tab => {
          const selected = meterType === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? tab.color + '1F' : theme.card,
                  borderColor: selected ? tab.color : theme.border,
                },
              ]}
              onPress={() => {
                setMeterType(tab.id);
                setFocusedMonth(null);
                setExpandedId(null);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon as any} size={15} color={selected ? tab.color : theme.textSecondary} />
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? theme.text : theme.textSecondary, fontFamily: selected ? font.bold : font.medium },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {months.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('history.emptyTitle')}</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('history.emptyText')}</Text>
        </View>
      ) : (
        <>
          {/* Динамика по месяцам */}
          <View style={[styles.overview, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.overviewHead}>
              <Text style={[styles.overviewTitle, { color: theme.textSecondary }]}>
                {compareBy === 'cost' ? t('history.dynamicsCost') : t('history.dynamicsConsumption')}
              </Text>
              {focusedMonth && (
                <TouchableOpacity onPress={() => setFocusedMonth(null)} hitSlop={8}>
                  <Text style={[styles.overviewReset, { color: theme.primary }]}>{t('history.allPeriods')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.bars}>
              {bars.map(bar => {
                const isHighlighted = bar.monthKey === highlighted;
                const hasData = months.some(m => m.monthKey === bar.monthKey);
                const height = bar.value > 0 ? Math.max(6, (bar.value / maxBar) * BAR_AREA) : 3;
                return (
                  <TouchableOpacity
                    key={bar.monthKey}
                    style={styles.barCol}
                    onPress={() => hasData && toggleMonth(bar.monthKey)}
                    activeOpacity={hasData ? 0.7 : 1}
                    accessibilityLabel={`${getMonthTitle(bar.monthKey, t)}: ${formatMetric(bar.value)}`}
                  >
                    <Text
                      style={[
                        styles.barValue,
                        { color: isHighlighted ? theme.text : theme.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {bar.value > 0 ? formatCompact(bar.value) : '—'}
                    </Text>
                    <View style={[styles.barTrack, { height: BAR_AREA }]}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height,
                            backgroundColor: bar.value > 0 ? typeColor : theme.border,
                            opacity: isHighlighted || bar.value === 0 ? 1 : 0.35,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barLabel,
                        {
                          color: isHighlighted ? theme.text : theme.textSecondary,
                          fontFamily: isHighlighted ? font.bold : font.medium,
                        },
                      ]}
                    >
                      {monthShort(bar.monthKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.overviewStats, { borderTopColor: theme.border }]}>
              <View style={styles.stat}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('history.avgPerMonth')}</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{formatMetric(average)}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.stat}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  {t('history.monthsTotal', { count: filledBars.length })}
                </Text>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {formatMetric(filledBars.reduce((s, b) => s + b.value, 0))}
                </Text>
              </View>
            </View>
          </View>

          {visibleMonths.map(month => (
            <MonthSection
              key={month.monthKey}
              month={month}
              compareBy={compareBy}
              formatMetric={formatMetric}
              expandedId={expandedId}
              onToggleRow={id => setExpandedId(prev => (prev === id ? null : id))}
              onEdit={onEdit}
              onDelete={onDelete}
              onPreviewPhoto={onPreviewPhoto}
              onSendMonth={onSendMonth}
            />
          ))}
        </>
      )}
    </View>
  );
};

const BAR_AREA = 84;

interface MonthSectionProps {
  month: HistoryMonth;
  compareBy: 'cost' | 'consumption';
  formatMetric: (value: number) => string;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  onEdit: (reading: ReadingEntry) => void;
  onDelete: (reading: ReadingEntry) => void;
  onPreviewPhoto: (uri: string) => void;
  onSendMonth: (monthKey: string) => void;
}

const MonthSection: React.FC<MonthSectionProps> = ({
  month,
  compareBy,
  formatMetric,
  expandedId,
  onToggleRow,
  onEdit,
  onDelete,
  onPreviewPhoto,
  onSendMonth,
}) => {
  const { theme, settings, t } = useApp();
  const showCost = compareBy === 'cost';

  return (
    <View style={styles.month}>
      <View style={styles.monthHead}>
        <View style={styles.monthTitleLine}>
          <Text style={[styles.monthTitle, { color: theme.text }]}>{getMonthTitle(month.monthKey, t)}</Text>
          <Text style={[styles.monthTotal, { color: theme.text }]}>
            {showCost ? formatCurrency(month.totalCost, settings.currency) : formatMetric(month.totalConsumption)}
          </Text>
        </View>
        <View style={styles.monthMeta}>
          <Text style={[styles.monthMetaText, { color: theme.textSecondary }]}>
            {t('history.entriesCount', { count: month.rows.length })}
            {!showCost ? ` · ${formatCurrency(month.totalCost, settings.currency)}` : ''}
          </Text>
          {month.change !== null && <ChangeBadge change={month.change} label={t('history.vsPrevMonth')} />}
        </View>
      </View>

      <View style={[styles.monthCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {month.rows.map((row, index) => (
          <ReadingRow
            key={row.reading.id}
            row={row}
            first={index === 0}
            expanded={expandedId === row.reading.id}
            onToggle={() => onToggleRow(row.reading.id)}
            onEdit={onEdit}
            onDelete={onDelete}
            onPreviewPhoto={onPreviewPhoto}
          />
        ))}

        <TouchableOpacity
          style={[styles.sendRow, { borderTopColor: theme.border }]}
          onPress={() => onSendMonth(month.monthKey)}
          activeOpacity={0.7}
        >
          <Ionicons name="paper-plane-outline" size={16} color={TELEGRAM} />
          <Text style={[styles.sendText, { color: TELEGRAM }]}>{t('history.sendMonth')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const TELEGRAM = '#229ED9';

interface ReadingRowProps {
  row: HistoryRow;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (reading: ReadingEntry) => void;
  onDelete: (reading: ReadingEntry) => void;
  onPreviewPhoto: (uri: string) => void;
}

const ReadingRow: React.FC<ReadingRowProps> = ({
  row,
  first,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onPreviewPhoto,
}) => {
  const { theme, meters, settings, t } = useApp();
  const r = row.reading;
  const meter = meters.find(m => m.id === r.meterId);
  const color = meter?.color || theme.primary;
  const unit = getMeterUnitLabel(r.meterType as MeterType, t);
  const photoUri = getPhotoUri(r.photo);

  return (
    <View style={[!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <TouchableOpacity
        style={styles.row}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityState={{ expanded }}
      >
        <View style={[styles.rowIcon, { backgroundColor: color + '1F' }]}>
          <Ionicons name={getMeterIcon(r.meterType) as any} size={18} color={color} />
        </View>

        <View style={styles.rowMain}>
          <View style={styles.rowTitleLine}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {meter ? resolveMeterName(meter, t) : r.meterType}
            </Text>
            {(r.notes || photoUri) && (
              <View style={styles.rowFlags}>
                {r.notes ? <Ionicons name="chatbubble-ellipses-outline" size={13} color={theme.textMuted} /> : null}
                {photoUri ? <Ionicons name="camera-outline" size={13} color={theme.textMuted} /> : null}
              </View>
            )}
          </View>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
            {formatDate(r.date, t)}
            {r.isReplacement ? ` · ${t('history.replacedBadge')}` : ''}
          </Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={[styles.rowConsumption, { color: theme.text }]} numberOfLines={1}>
            +{formatNumber(r.consumption)} {unit}
          </Text>
          <View style={styles.rowCostLine}>
            {row.change !== null && Math.abs(row.change) >= NOTICEABLE_CHANGE && (
              <ChangeBadge change={row.change} compact />
            )}
            <Text style={[styles.rowCost, { color: theme.textSecondary }]}>
              {formatCurrency(r.cost, settings.currency)}
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textMuted}
          style={styles.chevron}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          <View style={[styles.meterLine, { backgroundColor: theme.surfaceLight }]}>
            <View style={styles.meterCell}>
              <Text style={[styles.meterCellLabel, { color: theme.textSecondary }]}>{t('history.was')}</Text>
              <Text style={[styles.meterCellValue, { color: theme.text }]}>
                {formatNumber(r.previousReading)}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={theme.textMuted} />
            <View style={styles.meterCell}>
              <Text style={[styles.meterCellLabel, { color: theme.textSecondary }]}>{t('history.became')}</Text>
              <Text style={[styles.meterCellValue, { color: theme.text, fontFamily: font.extrabold }]}>
                {formatNumber(r.reading)}
              </Text>
            </View>
            <View style={[styles.meterCell, styles.meterCellRight]}>
              <Text style={[styles.meterCellLabel, { color: theme.textSecondary }]}>{unit}</Text>
              <Text style={[styles.meterCellValue, { color }]}>+{formatNumber(r.consumption)}</Text>
            </View>
          </View>

          {row.change !== null && (
            <Text style={[styles.detailNote, { color: theme.textSecondary }]}>
              {t('history.vsPrevReading', {
                value: `${row.change >= 0 ? '+' : '−'}${Math.round(Math.abs(row.change) * 100)}%`,
              })}
            </Text>
          )}

          {r.notes ? (
            <View style={styles.noteLine}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.textMuted} />
              <Text style={[styles.noteText, { color: theme.text }]}>{r.notes}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {photoUri && (
              <TouchableOpacity onPress={() => onPreviewPhoto(photoUri)} activeOpacity={0.8}>
                <Image source={{ uri: photoUri }} style={[styles.thumb, { borderColor: theme.border }]} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.surfaceLight }]}
              onPress={() => onDelete(r)}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
              <Text style={[styles.actionText, { color: theme.danger }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.badgeBg }]}
              onPress={() => onEdit(r)}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={16} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>{t('history.edit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

/**
 * Изменение к прошлому периоду. Рост расхода — предупреждающий цвет,
 * снижение — зеленый: так проще заметить утечку или забытый обогреватель.
 */
const ChangeBadge: React.FC<{ change: number; label?: string; compact?: boolean }> = ({
  change,
  label,
  compact,
}) => {
  const { theme } = useApp();
  const percent = Math.round(Math.abs(change) * 100);
  const flat = percent === 0;
  const color = flat ? theme.textSecondary : change > 0 ? theme.warning : theme.success;
  const icon = flat ? 'remove' : change > 0 ? 'arrow-up' : 'arrow-down';
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A' }, compact && styles.badgeCompact]}>
      <Ionicons name={icon} size={compact ? 10 : 11} color={color} />
      <Text style={[styles.badgeText, { color }, compact && styles.badgeTextCompact]}>
        {percent}%{label ? ` ${label}` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
  },
  reportBtnText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  chipsScroll: {
    marginHorizontal: -16,
    marginBottom: 14,
  },
  chips: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: fontSize.sm,
  },
  overview: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  overviewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  overviewTitle: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  overviewReset: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barValue: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    marginBottom: 4,
  },
  barTrack: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '72%',
    maxWidth: 36,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: fontSize.xs,
    marginTop: 6,
  },
  overviewStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 12,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
    marginBottom: 2,
  },
  statValue: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  month: {
    marginBottom: 20,
  },
  monthHead: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  monthTitleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  monthMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  monthMetaText: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  monthTotal: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
  },
  monthCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    gap: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  rowFlags: {
    flexDirection: 'row',
    gap: 4,
  },
  rowSub: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowCostLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  rowConsumption: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  rowCost: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  chevron: {
    marginLeft: -2,
  },
  details: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  meterLine: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  meterCell: {},
  meterCellRight: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  meterCellLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
    marginBottom: 2,
  },
  meterCellValue: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  detailNote: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  noteLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: font.regular,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendText: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeCompact: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  badgeTextCompact: {
    fontSize: fontSize.xs,
  },
  emptyBox: {
    alignItems: 'center',
    padding: 32,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlign: 'center',
  },
});
