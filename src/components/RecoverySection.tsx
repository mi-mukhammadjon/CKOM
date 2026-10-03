import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import type { RecoveryCandidate } from '../services/db/types';
import type { Translate, TranslationKey } from '../i18n';
import { formatDate, formatNumber } from '../utils/calculator';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { appAlert, appError, appSuccess } from './AppDialog';
import { AppModal } from './AppModal';

/** «4 окт 2026, 09:15» из метки времени копии */
function formatStamp(ms: number, t: Translate): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${formatDate(dateKey, t)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Подтверждение и восстановление из выбранной копии */
function useRestore() {
  const { restoreFromCandidate, t } = useApp();
  return (candidate: RecoveryCandidate, onDone?: () => void) => {
    appAlert(t('recovery.confirmTitle'), t('recovery.confirmText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('recovery.restore'),
        onPress: async () => {
          try {
            await restoreFromCandidate(candidate.name);
            onDone?.();
            appSuccess(t('recovery.restoredTitle'), t('recovery.restoredText'));
          } catch (e) {
            console.warn('Восстановление не удалось', e);
            appError(t('common.error'), t('recovery.failed'));
          }
        },
      },
    ]);
  };
}

/**
 * Показывается один раз после запуска, если основная база пуста,
 * а в копиях нашлись показания. Размещается в корне приложения.
 */
export const RecoveryPrompt: React.FC = () => {
  const { recoveryOffer, dismissRecoveryOffer, restoreFromCandidate, t } = useApp();

  useEffect(() => {
    if (!recoveryOffer) return;
    const offer = recoveryOffer;
    appAlert(
      t('recovery.foundTitle'),
      t('recovery.foundText', {
        date: formatStamp(offer.createdAt, t),
        readings: offer.readings,
        payments: offer.payments,
      }),
      [
        { text: t('recovery.later'), style: 'cancel', onPress: dismissRecoveryOffer },
        {
          text: t('recovery.restore'),
          onPress: async () => {
            try {
              await restoreFromCandidate(offer.name);
              appSuccess(t('recovery.restoredTitle'), t('recovery.restoredText'));
            } catch {
              appError(t('common.error'), t('recovery.failed'));
            }
          },
        },
      ],
      'warning'
    );
    // предложение показываем один раз на каждую найденную копию
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryOffer?.name]);

  return null;
};

/** Строка в настройках и окно со списком копий */
export const RecoverySection: React.FC = () => {
  const { theme, listRecoveryCandidates, t } = useApp();
  const restore = useRestore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecoveryCandidate[] | null>(null);

  if (Platform.OS === 'web') return null;

  const openList = async () => {
    setOpen(true);
    setItems(null);
    setItems(await listRecoveryCandidates().catch(() => []));
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.borderLight }]}
        onPress={openList}
        activeOpacity={0.7}
      >
        <Ionicons name="time-outline" size={20} color={theme.primary} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>{t('recovery.section')}</Text>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('recovery.sectionSub')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </TouchableOpacity>

      <AppModal visible={open} variant="sheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>{t('recovery.section')}</Text>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: theme.surfaceLight }]}
                onPress={() => setOpen(false)}
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>{t('recovery.sectionSub')}</Text>

            {items === null ? (
              <ActivityIndicator color={theme.primary} style={styles.loading} />
            ) : items.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('recovery.empty')}</Text>
            ) : (
              <View style={styles.list}>
                {items.map(item => (
                  <View key={item.name} style={[styles.item, { backgroundColor: theme.surfaceLight }]}>
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, { color: theme.text }]}>
                        {t(`recovery.kind.${item.kind}` as TranslationKey)} · {formatStamp(item.createdAt, t)}
                      </Text>
                      <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                        {item.readable
                          ? t('recovery.counts', {
                              readings: formatNumber(item.readings),
                              payments: formatNumber(item.payments),
                            }) +
                            (item.lastReadingDate
                              ? ` · ${t('recovery.lastReading', { date: formatDate(item.lastReadingDate, t) })}`
                              : '')
                          : t('recovery.unreadable')}
                      </Text>
                    </View>
                    {item.readable && (
                      <TouchableOpacity
                        style={[styles.restoreBtn, { backgroundColor: theme.primary }]}
                        onPress={() => restore(item, () => setOpen(false))}
                      >
                        <Text style={[buttonText.sm, { color: theme.onPrimary }]}>{t('recovery.restore')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </AppModal>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  rowSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  closeBtn: {
    ...button.icon,
    width: 36,
    height: 36,
  },
  sub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 4,
    marginBottom: 14,
  },
  loading: {
    marginVertical: 24,
  },
  empty: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    marginVertical: 24,
  },
  list: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  itemSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  restoreBtn: {
    ...button.sm,
  },
});
