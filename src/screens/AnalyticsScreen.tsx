import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import {
  calculateMonthBalance,
  calculateMonthSummaries,
  formatCurrency,
  formatNumber,
  getMeterUnitLabel,
} from '../utils/calculator';
import { getMeterColor, resolveMeterName } from '../utils/meters';
import { font, fontSize, radius } from '../constants/theme';

interface AnalyticsScreenProps {
  onOpenReports?: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ onOpenReports }) => {
  const { theme, readings, payments, meters, settings, t } = useApp();

  const summaries = calculateMonthSummaries(readings, t);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(summaries[0]?.monthKey || '');

  const activeSummary = summaries.find(s => s.monthKey === selectedMonthKey) || summaries[0];

  // При смене объекта выбранный месяц может отсутствовать в его истории
  useEffect(() => {
    if (activeSummary && activeSummary.monthKey !== selectedMonthKey) {
      setSelectedMonthKey(activeSummary.monthKey);
    }
  }, [activeSummary, selectedMonthKey]);

  const maxMonthCost = Math.max(...summaries.map(s => s.totalCost), 1);
  const totalMonths = Math.max(summaries.length, 1);
  const averageMonthlyCost = Math.round(
    summaries.reduce((sum, s) => sum + s.totalCost, 0) / totalMonths
  );

  // Последние 6 периодов для графика оплат
  const paymentChartMonths = summaries
    .slice(0, 6)
    .map(s => calculateMonthBalance(s.monthKey, readings, payments))
    .reverse();
  const hasAnyPayments = paymentChartMonths.some(b => b.paid > 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{t('analytics.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('analytics.subtitle')}
        </Text>
      </View>

      {/* Вход в отчеты: PDF, Excel и текст для инспектора */}
      {onOpenReports && (
        <TouchableOpacity
          style={[styles.reportsCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={onOpenReports}
          activeOpacity={0.8}
        >
          <View style={[styles.reportsIcon, { backgroundColor: theme.badgeBg }]}>
            <Ionicons name="document-text-outline" size={22} color={theme.primary} />
          </View>
          <View style={styles.reportsText}>
            <Text style={[styles.reportsTitle, { color: theme.text }]}>{t('reports.open')}</Text>
            <Text style={[styles.reportsHint, { color: theme.textSecondary }]}>
              {t('reports.openHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      )}

      {/* Пустое состояние */}
      {summaries.length === 0 && (
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.card, borderColor: theme.border, alignItems: 'center' },
          ]}
        >
          <Ionicons name="bar-chart-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.summaryLabel, { color: theme.text, marginTop: 10 }]}>
            {t('analytics.emptyLabel')}
          </Text>
          <Text
            style={[styles.summarySub, { color: theme.textSecondary, textAlign: 'center' }]}
          >
            {t('analytics.emptyText')}
          </Text>
        </View>
      )}

      {summaries.length > 0 && (
        <>
          {/* Средний расход */}
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  {t('analytics.averageLabel')}
                </Text>
                <Text style={[styles.summaryBigVal, { color: theme.text }]}>
                  {formatCurrency(averageMonthlyCost, settings.currency)}
                </Text>
              </View>

              <View style={[styles.summaryIconBox, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="stats-chart" size={24} color={theme.primary} />
              </View>
            </View>

            <Text style={[styles.summarySub, { color: theme.textSecondary }]}>
              {t('analytics.averageSub', { count: summaries.length })}
            </Text>
          </View>

          {/* Помесячные расходы */}
          <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.chartTitle, { color: theme.text }]}>
              {t('analytics.chartTitle')}
            </Text>
            <Text style={[styles.chartSub, { color: theme.textSecondary }]}>
              {t('analytics.chartSub')}
            </Text>

            <View style={styles.barChartContainer}>
              {summaries
                .slice(0, 6)
                .reverse()
                .map(s => {
                  const isSelected = s.monthKey === activeSummary?.monthKey;
                  const heightPct = Math.max(15, Math.round((s.totalCost / maxMonthCost) * 100));

                  return (
                    <TouchableOpacity
                      key={s.monthKey}
                      style={styles.barCol}
                      onPress={() => setSelectedMonthKey(s.monthKey)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.barCostLabel, { color: theme.textMuted }]}>
                        {Math.round(s.totalCost / 1000)}k
                      </Text>

                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${heightPct}%`,
                              backgroundColor: isSelected
                                ? theme.primary
                                : theme.primaryLight + '88',
                            },
                          ]}
                        />
                      </View>

                      <Text
                        style={[
                          styles.barMonthLabel,
                          {
                            color: isSelected ? theme.primary : theme.textSecondary,
                            fontFamily: isSelected ? font.extrabold : font.medium,
                          },
                        ]}
                      >
                        {s.monthName.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>

          {/* Начислено против оплаченного */}
          {hasAnyPayments && (
            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.chartTitle, { color: theme.text }]}>
                {t('analytics.paymentsTitle')}
              </Text>
              <Text style={[styles.chartSub, { color: theme.textSecondary }]}>
                {t('analytics.paymentsSub')}
              </Text>

              <View style={styles.payList}>
                {paymentChartMonths.map(balance => {
                  const summary = summaries.find(s => s.monthKey === balance.monthKey);
                  const paidPct =
                    balance.charged > 0
                      ? Math.min(100, Math.round((balance.paid / balance.charged) * 100))
                      : balance.paid > 0
                      ? 100
                      : 0;
                  const barColor =
                    balance.due > 0 ? theme.warning : balance.due < 0 ? theme.info : theme.success;

                  return (
                    <View key={balance.monthKey} style={styles.payRow}>
                      <View style={styles.payHeader}>
                        <Text style={[styles.payMonth, { color: theme.text }]}>
                          {summary?.monthName || balance.monthKey}
                        </Text>
                        <Text style={[styles.payNumbers, { color: theme.textSecondary }]}>
                          {formatCurrency(balance.paid, '')} /{' '}
                          {formatCurrency(balance.charged, settings.currency)}
                        </Text>
                      </View>

                      <View style={[styles.progressTrack, { backgroundColor: theme.surfaceLight }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${paidPct}%`, backgroundColor: barColor },
                          ]}
                        />
                      </View>

                      <Text style={[styles.consumptionSub, { color: barColor }]}>
                        {balance.due > 0
                          ? t('payments.due') +
                            ': ' +
                            formatCurrency(balance.due, settings.currency)
                          : balance.due < 0
                          ? t('payments.overpaid') +
                            ': ' +
                            formatCurrency(-balance.due, settings.currency)
                          : t('payments.settled')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {/* Структура выбранного месяца */}
      {activeSummary && (
        <View style={[styles.structureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.structureHeader}>
            <View>
              <Text style={[styles.structureTitle, { color: theme.text }]}>
                {t('analytics.structureTitle', { month: activeSummary.monthName })}
              </Text>
              <Text style={[styles.structureCost, { color: theme.primary }]}>
                {formatCurrency(activeSummary.totalCost, settings.currency)}
              </Text>
            </View>
          </View>

          <View style={styles.metersBreakdown}>
            {meters.map(meter => {
              const data = activeSummary.byMeter[meter.type];
              const cost = data?.cost || 0;
              const consumption = data?.consumption || 0;
              const percentage =
                activeSummary.totalCost > 0
                  ? Math.round((cost / activeSummary.totalCost) * 100)
                  : 0;

              return (
                <View key={meter.id} style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <View style={styles.breakdownNameRow}>
                      <View style={[styles.dot, { backgroundColor: meter.color }]} />
                      <Text style={[styles.meterLabelName, { color: theme.text }]}>
                        {resolveMeterName(meter, t)}
                      </Text>
                    </View>

                    <View style={styles.breakdownValueRow}>
                      <Text style={[styles.breakdownCost, { color: theme.text }]}>
                        {formatCurrency(cost, settings.currency)}
                      </Text>
                      <Text style={[styles.breakdownPct, { color: theme.textSecondary }]}>
                        ({percentage}%)
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.progressTrack, { backgroundColor: theme.surfaceLight }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${percentage}%`, backgroundColor: meter.color },
                      ]}
                    />
                  </View>

                  <Text style={[styles.consumptionSub, { color: theme.textMuted }]}>
                    {t('analytics.consumptionSub', {
                      value: formatNumber(consumption),
                      unit: getMeterUnitLabel(meter.type, t),
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Советы по экономии */}
      <View style={[styles.tipsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.tipsHeader}>
          <Ionicons name="bulb-outline" size={20} color={theme.warning} />
          <Text style={[styles.tipsTitle, { color: theme.text }]}>{t('analytics.tipsTitle')}</Text>
        </View>

        <View style={styles.tipsList}>
          <View style={[styles.tipItem, { backgroundColor: theme.surfaceLight }]}>
            <Ionicons name="flash-outline" size={18} color={getMeterColor('electricity')} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>
              {t('analytics.tip1')}
            </Text>
          </View>

          <View style={[styles.tipItem, { backgroundColor: theme.surfaceLight }]}>
            <Ionicons name="water-outline" size={18} color={getMeterColor('cold_water')} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>
              {t('analytics.tip2')}
            </Text>
          </View>

          <View style={[styles.tipItem, { backgroundColor: theme.surfaceLight }]}>
            <Ionicons name="flame-outline" size={18} color={getMeterColor('gas')} />
            <Text style={[styles.tipText, { color: theme.textSecondary }]}>
              {t('analytics.tip3')}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  reportsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
  },
  reportsIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsText: {
    flex: 1,
  },
  reportsTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  reportsHint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 16,
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
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.5,
  },
  summaryBigVal: {
    fontSize: fontSize.xxl,
    fontFamily: font.extrabold,
    marginTop: 4,
  },
  summaryIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 8,
  },
  chartCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  chartSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
    marginBottom: 16,
  },
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barCostLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginBottom: 4,
  },
  barTrack: {
    width: 22,
    height: 100,
    justifyContent: 'flex-end',
    borderRadius: 8,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barMonthLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 6,
  },
  structureCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  structureHeader: {
    marginBottom: 14,
  },
  structureTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  structureCost: {
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
    marginTop: 2,
  },
  metersBreakdown: {
    gap: 12,
  },
  breakdownItem: {
    gap: 4,
  },
  breakdownItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meterLabelName: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  breakdownValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownCost: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  breakdownPct: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  consumptionSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  payList: {
    gap: 14,
    marginTop: 4,
  },
  payRow: {
    gap: 6,
  },
  payHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payMonth: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  payNumbers: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  tipsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
    flex: 1,
  },
  tipsList: {
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  tipText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 18,
    flex: 1,
  },
});
