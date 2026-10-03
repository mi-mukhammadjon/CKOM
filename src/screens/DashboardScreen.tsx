import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { QuickStats } from '../components/QuickStats';
import { MeterCard } from '../components/MeterCard';
import { Meter } from '../types';
import { formatCurrency, formatNumber, formatDate, getMeterUnitLabel } from '../utils/calculator';
import { getMeterIcon, needsInitialReading, resolveMeterName } from '../utils/meters';
import { InitialReadingsModal } from '../components/InitialReadingsModal';
import { font, fontSize, radius, button, buttonText, INK_ON_BRIGHT } from '../constants/theme';

interface DashboardScreenProps {
  onNavigateToEntry: (selectedMeter?: Meter) => void;
  onNavigateToHistory: () => void;
  onNavigateToTariffs: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigateToEntry,
  onNavigateToHistory,
  onNavigateToTariffs,
}) => {
  const { theme, meters, readings, settings, activeProperty, t } = useApp();

  // readings из контекста уже отсортированы от свежих к старым
  const getMeterReadings = (meterId: string) => readings.filter(r => r.meterId === meterId);
  const recentReadings = readings.slice(0, 4);
  const [showInitial, setShowInitial] = useState(false);
  const metersWithoutBaseline = meters.filter(m => needsInitialReading(m, readings)).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <QuickStats onEnterReading={() => onNavigateToEntry()} />

      {/* Без начальных цифр первый расход посчитался бы от нуля — просим их внести */}
      {metersWithoutBaseline > 0 && (
        <View style={[styles.initialBanner, { backgroundColor: theme.card, borderColor: theme.warning }]}>
          <View style={[styles.initialIcon, { backgroundColor: theme.warning + '22' }]}>
            <Ionicons name="flag-outline" size={20} color={theme.warning} />
          </View>
          <View style={styles.initialText}>
            <Text style={[styles.initialTitle, { color: theme.text }]}>{t('initial.bannerTitle')}</Text>
            <Text style={[styles.initialSub, { color: theme.textSecondary }]}>
              {t('initial.bannerText', { count: metersWithoutBaseline })}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.initialBtn, { backgroundColor: theme.warning }]}
            onPress={() => setShowInitial(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.initialBtnText, { color: INK_ON_BRIGHT }]}>{t('initial.bannerButton')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Заголовок списка счетчиков */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t('dashboard.metersTitle')}
        </Text>
        <TouchableOpacity onPress={onNavigateToTariffs} style={styles.tariffLink}>
          <Text style={[styles.tariffLinkText, { color: theme.primary }]}>
            {t('dashboard.tariffsLink')}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Пустое состояние: у объекта нет счетчиков */}
      {meters.length === 0 && (
        <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="speedometer-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('dashboard.emptyTitle')}</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t('dashboard.emptyText', { property: activeProperty.name })}
          </Text>
        </View>
      )}

      <View style={styles.meterGrid}>
        {meters.map(meter => (
          <MeterCard
            key={meter.id}
            meter={meter}
            meterReadings={getMeterReadings(meter.id)}
            onAddReading={onNavigateToEntry}
          />
        ))}
      </View>

      {/* Последние записи журнала */}
      {recentReadings.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t('dashboard.recentTitle')}
            </Text>
            <TouchableOpacity onPress={onNavigateToHistory}>
              <Text style={[styles.allHistoryLink, { color: theme.primary }]}>
                {t('dashboard.allHistory')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.recentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {recentReadings.map((r, idx) => {
              const meter = meters.find(m => m.id === r.meterId);
              const isLast = idx === recentReadings.length - 1;
              const unit = getMeterUnitLabel(r.meterType, t);

              return (
                <View
                  key={r.id}
                  style={[
                    styles.recentRow,
                    !isLast && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                  ]}
                >
                  <View
                    style={[
                      styles.recentIcon,
                      { backgroundColor: (meter?.color || theme.primary) + '20' },
                    ]}
                  >
                    <Ionicons
                      name={getMeterIcon(r.meterType) as any}
                      size={18}
                      color={meter?.color || theme.primary}
                    />
                  </View>

                  <View style={styles.recentInfo}>
                    <Text style={[styles.recentMeterName, { color: theme.text }]}>
                      {meter ? resolveMeterName(meter, t) : r.meterType}
                    </Text>
                    <Text style={[styles.recentDate, { color: theme.textSecondary }]}>
                      {formatDate(r.date, t)} •{' '}
                      {t('dashboard.readingPrefix', { value: formatNumber(r.reading) })}
                    </Text>
                  </View>

                  <View style={styles.recentCostCol}>
                    <Text style={[styles.recentCost, { color: theme.text }]}>
                      {formatCurrency(r.cost, settings.currency)}
                    </Text>
                    <Text style={[styles.recentConsumption, { color: theme.textSecondary }]}>
                      +{formatNumber(r.consumption)} {unit}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />

      <InitialReadingsModal visible={showInitial} onClose={() => setShowInitial(false)} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  initialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: 20,
  },
  initialIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    flex: 1,
  },
  initialTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  initialSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 17,
    marginTop: 2,
  },
  initialBtn: {
    ...button.sm,
  },
  initialBtnText: {
    ...buttonText.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  meterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  tariffLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tariffLinkText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  emptyBox: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontFamily: font.bold,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 19,
  },
  recentSection: {},
  allHistoryLink: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  recentCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentMeterName: {
    fontSize: fontSize.sm,
    fontFamily: font.bold,
  },
  recentDate: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  recentCostCol: {
    alignItems: 'flex-end',
  },
  recentCost: {
    fontSize: fontSize.sm,
    fontFamily: font.extrabold,
  },
  recentConsumption: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
});
