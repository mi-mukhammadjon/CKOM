import { AppData, MeterType } from '../types';
import { createTranslator, type Translate } from '../i18n';
import {
  calculateMonthBalance,
  calculateMonthSummaries,
  formatNumber,
  getCurrentMonthKey,
  getMeterUnitLabel,
  getMonthTitle,
} from '../utils/calculator';
import { getMeterTypeShortLabel, needsInitialReading } from '../utils/meters';

export interface WidgetMeter {
  id: string;
  type: MeterType;
  label: string;
  value: string;
  unit: string;
  /** Расход за последний период, например «+240» */
  consumption: string | null;
  color: string;
  /** Показание за текущий месяц уже внесено */
  submitted: boolean;
}

/** Все, что нужно виджету для отрисовки, — без доступа к базе и контексту */
export interface WidgetModel {
  propertyName: string;
  monthTitle: string;
  total: string;
  currency: string;
  /** Доли затрат по ресурсам для цветной полосы */
  breakdown: { color: string; share: number }[];
  diffPercent: number | null;
  entered: number;
  totalMeters: number;
  deadlineDay: number;
  daysToDeadline: number;
  due: string | null;
  meters: WidgetMeter[];
  labels: {
    charged: string;
    entered: string;
    deadline: string;
    enterReading: string;
    vsPrev: string | null;
    due: string | null;
    allDone: string;
    notEntered: string;
    noData: string;
  };
}

/**
 * Собирает модель виджета для объекта. Если объект удален,
 * берется объект по умолчанию — виджет не остается пустым.
 */
export function buildWidgetModel(data: AppData, propertyId?: string): WidgetModel | null {
  const t: Translate = createTranslator(data.settings.language);
  const property =
    data.properties.find(p => p.id === propertyId) ||
    data.properties.find(p => p.isDefault) ||
    data.properties[0];
  if (!property) return null;

  const meters = data.meters.filter(m => m.propertyId === property.id);
  const readings = data.readings
    .filter(r => r.propertyId === property.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const payments = data.payments.filter(p => p.propertyId === property.id);

  const monthKey = getCurrentMonthKey();
  const summaries = calculateMonthSummaries(readings, t);
  const current = summaries.find(s => s.monthKey === monthKey);
  const previous = summaries.find(s => s.monthKey < monthKey);
  const totalCost = current?.totalCost ?? 0;
  const balance = calculateMonthBalance(monthKey, readings, payments);

  const diffPercent =
    current && previous && previous.totalCost > 0
      ? Math.round(((current.totalCost - previous.totalCost) / previous.totalCost) * 100)
      : null;

  const widgetMeters: WidgetMeter[] = meters.map(meter => {
    const latest = readings.find(r => r.meterId === meter.id);
    return {
      id: meter.id,
      type: meter.type,
      label: getMeterTypeShortLabel(meter.type, t),
      value: formatNumber(meter.currentReading),
      unit: getMeterUnitLabel(meter.type, t),
      consumption: latest ? `+${formatNumber(latest.consumption)}` : null,
      color: meter.color,
      submitted: !!latest && latest.date.startsWith(monthKey),
    };
  });

  const entered = widgetMeters.filter(m => m.submitted).length;
  const deadlineDay = data.settings.reminderDay || 25;
  const due = balance.charged > 0 && balance.due > 0 ? formatNumber(balance.due) : null;

  return {
    propertyName: property.name,
    monthTitle: getMonthTitle(monthKey, t),
    total: formatNumber(totalCost),
    currency: data.settings.currency,
    breakdown:
      totalCost > 0 && current
        ? meters
            .map(m => ({ color: m.color, share: (current.byMeter[m.type]?.cost || 0) / totalCost }))
            .filter(part => part.share > 0)
        : [],
    diffPercent,
    entered,
    totalMeters: widgetMeters.length,
    deadlineDay,
    daysToDeadline: deadlineDay - new Date().getDate(),
    due,
    meters: widgetMeters,
    labels: {
      charged: t('stats.heroLabel', { month: getMonthTitle(monthKey, t) }),
      entered: t('stats.progressShort', { entered, total: widgetMeters.length }),
      deadline: t('stats.deadlineShort', { day: deadlineDay }),
      enterReading: t('entry.title'),
      vsPrev:
        diffPercent === null
          ? null
          : t('stats.vsPrev', {
              value: `${diffPercent > 0 ? '↑' : '↓'} ${Math.abs(diffPercent)}%`,
            }),
      due: due ? t('stats.due', { amount: `${due} ${data.settings.currency}` }) : null,
      allDone: t('stats.allDone'),
      notEntered: meters.some(m => needsInitialReading(m, readings))
        ? t('initial.noBaseline')
        : t('dashboard.notEntered'),
      noData: t('common.noData'),
    },
  };
}
