import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meter, ReadingEntry } from '../types';
import { useApp } from '../context/AppContext';
import { formatNumber, getCurrentMonthKey, getMeterUnitLabel } from '../utils/calculator';
import { getMeterIcon, resolveMeterName } from '../utils/meters';
import { font, fontSize, radius } from '../constants/theme';

interface MeterCardProps {
  meter: Meter;
  /** Показания этого счетчика, от свежих к старым */
  meterReadings: ReadingEntry[];
  onAddReading: (meter: Meter) => void;
}

const TREND_LENGTH = 5;

/**
 * Компактная плитка счетчика для сетки 2×2: текущее показание,
 * расход за последний период и мини-график расхода за 5 периодов.
 */
export const MeterCard: React.FC<MeterCardProps> = ({ meter, meterReadings, onAddReading }) => {
  const { theme, t } = useApp();

  const unit = getMeterUnitLabel(meter.type, t);
  const latest = meterReadings[0];
  const submittedThisMonth = !!latest && latest.date.startsWith(getCurrentMonthKey());

  // Старые периоды слева, свежий — справа
  const trend = meterReadings.slice(0, TREND_LENGTH).map(r => r.consumption).reverse();
  const trendMax = Math.max(...trend, 1);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => onAddReading(meter)}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: meter.color + '24' }]}>
          <Ionicons name={getMeterIcon(meter.type) as any} size={18} color={meter.color} />
        </View>
        <Ionicons name="add-circle" size={24} color={theme.textMuted} />
      </View>

      <View>
        <Text style={[styles.name, { color: theme.textSecondary }]} numberOfLines={1}>
          {resolveMeterName(meter, t)}
        </Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatNumber(meter.currentReading)}
          </Text>
          <Text style={[styles.unit, { color: theme.textMuted }]}>{unit}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        {meterReadings.length === 0 ? (
          // Истории нет: либо ждем начальные цифры, либо они уже внесены
          <View style={styles.pendingRow}>
            {!meter.lastReadingDate && (
              <View style={[styles.dot, { backgroundColor: theme.warning }]} />
            )}
            <Text style={[styles.footText, { color: theme.textMuted }]}>
              {meter.lastReadingDate ? t('initial.baseline') : t('initial.noBaseline')}
            </Text>
          </View>
        ) : submittedThisMonth ? (
          <Text style={[styles.footText, { color: theme.textSecondary }]}>
            +{formatNumber(latest.consumption)}
          </Text>
        ) : (
          <View style={styles.pendingRow}>
            <View style={[styles.dot, { backgroundColor: theme.warning }]} />
            <Text style={[styles.footText, { color: theme.textMuted }]}>
              {t('dashboard.notEntered')}
            </Text>
          </View>
        )}

        {trend.length > 1 && (
          <View style={styles.trend}>
            {trend.map((value, index) => (
              <View
                key={index}
                style={[
                  styles.trendBar,
                  {
                    height: Math.max(3, (value / trendMax) * 18),
                    backgroundColor: meter.color,
                    opacity: index === trend.length - 1 ? 1 : 0.4,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  value: {
    fontSize: fontSize.xl,
    fontFamily: font.bold,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    minHeight: 18,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  footText: {
    fontSize: fontSize.xs,
    fontFamily: font.semibold,
    fontVariant: ['tabular-nums'],
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 18,
  },
  trendBar: {
    width: 5,
    borderRadius: 2,
  },
});
