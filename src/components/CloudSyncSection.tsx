import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import type { TranslationKey } from '../i18n';
import { SyncError } from '../sync/engine';
import { formatDate } from '../utils/calculator';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { appAlert, appError, appSuccess } from './AppDialog';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** «4 окт 2026, 09:15» */
function formatTime(iso: string, t: ReturnType<typeof useApp>['t']): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, t)}, ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Раздел настроек: вход в аккаунт и синхронизация со сквозным шифрованием */
export const CloudSyncSection: React.FC = () => {
  const { theme, cloud, cloudSignIn, cloudSignUp, cloudSignOut, cloudSyncNow, cloudDeleteCopy, t } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | null>(null);

  const errorText = (code: string) => t(`cloud.error.${code}` as TranslationKey);

  const validate = () => {
    if (!EMAIL.test(email.trim())) {
      appError(t('common.error'), t('cloud.invalidEmail'));
      return false;
    }
    if (password.length < 8) {
      appError(t('common.error'), t('cloud.shortPassword'));
      return false;
    }
    return true;
  };

  const submit = async (mode: 'in' | 'up') => {
    if (!validate()) return;
    setBusy(mode);
    try {
      if (mode === 'in') {
        await cloudSignIn(email, password);
      } else if ((await cloudSignUp(email, password)) === 'confirm_email') {
        appSuccess(t('cloud.confirmEmailTitle'), t('cloud.confirmEmailText', { email: email.trim() }));
        return;
      }
      setPassword('');
    } catch (e) {
      appError(t('common.error'), errorText(e instanceof SyncError ? e.code : 'UNKNOWN'));
    } finally {
      setBusy(null);
    }
  };

  const confirmSignOut = () =>
    appAlert(t('cloud.signOutTitle'), t('cloud.signOutText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cloud.signOut'), style: 'destructive', onPress: () => cloudSignOut() },
    ]);

  const confirmDelete = () =>
    appAlert(t('cloud.deleteTitle'), t('cloud.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await cloudDeleteCopy();
          } catch (e) {
            appError(t('common.error'), errorText(e instanceof SyncError ? e.code : 'UNKNOWN'));
          }
        },
      },
    ]);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('cloud.section')}</Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.badgeRow}>
          <Ionicons name="lock-closed" size={14} color={theme.success} />
          <Text style={[styles.badgeText, { color: theme.success }]}>{t('cloud.e2e')}</Text>
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{t('cloud.hint')}</Text>

        {!cloud.configured ? (
          <Text style={[styles.notice, { color: theme.textMuted }]}>{t('cloud.notConfigured')}</Text>
        ) : !cloud.signedIn ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{t('cloud.email')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@mail.uz"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
            <Text style={[styles.label, { color: theme.textSecondary }]}>{t('cloud.password')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('cloud.passwordHint')}
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.surfaceLight }]}
                onPress={() => submit('up')}
                disabled={!!busy}
              >
                {busy === 'up' ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={[buttonText.md, { color: theme.text }]}>{t('cloud.signUp')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }]}
                onPress={() => submit('in')}
                disabled={!!busy}
              >
                {busy === 'in' ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <Text style={[buttonText.md, { color: theme.onPrimary }]}>{t('cloud.signIn')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={[styles.status, { backgroundColor: theme.surfaceLight }]}>
              <Ionicons
                name={cloud.syncing ? 'sync' : cloud.error ? 'cloud-offline-outline' : 'cloud-done-outline'}
                size={22}
                color={cloud.error ? theme.warning : theme.primary}
              />
              <View style={styles.statusText}>
                <Text style={[styles.statusTitle, { color: theme.text }]} numberOfLines={1}>
                  {t('cloud.signedInAs', { email: cloud.email ?? '' })}
                </Text>
                <Text style={[styles.statusSub, { color: cloud.error ? theme.warning : theme.textSecondary }]}>
                  {cloud.syncing
                    ? t('cloud.syncing')
                    : cloud.error
                    ? errorText(cloud.error)
                    : cloud.lastSyncedAt
                    ? t('cloud.lastSync', { time: formatTime(cloud.lastSyncedAt, t) })
                    : t('cloud.neverSynced')}
                </Text>
              </View>
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.surfaceLight }]}
                onPress={confirmSignOut}
              >
                <Text style={[buttonText.md, { color: theme.text }]}>{t('cloud.signOut')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }]}
                onPress={() => cloudSyncNow()}
                disabled={cloud.syncing}
              >
                {cloud.syncing ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <Text style={[buttonText.md, { color: theme.onPrimary }]}>{t('cloud.syncNow')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.linkBtn} onPress={confirmDelete}>
              <Text style={[styles.linkText, { color: theme.danger }]}>{t('cloud.deleteCopy')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
  },
  hint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    lineHeight: 17,
    marginTop: 6,
  },
  notice: {
    fontSize: fontSize.sm,
    fontFamily: font.medium,
    marginTop: 12,
  },
  form: {
    marginTop: 12,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    fontFamily: font.regular,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    ...button.md,
    flex: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
  statusSub: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  linkText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
});
