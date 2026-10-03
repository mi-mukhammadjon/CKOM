import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { button, buttonText, font, fontSize, radius } from '../constants/theme';
import { AppModal } from './AppModal';

export interface DialogButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export type DialogTone = 'success' | 'error' | 'warning' | 'info';

interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  tone: DialogTone;
}

type Listener = (queue: DialogRequest[]) => void;

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(listener => listener(queue));
}

/** Тон по умолчанию: опасное действие — предупреждение, иначе информация */
function inferTone(buttons: DialogButton[]): DialogTone {
  return buttons.some(b => b.style === 'destructive') ? 'warning' : 'info';
}

/**
 * Замена Alert.alert в фирменном оформлении. Сигнатура совпадает с Alert.alert,
 * четвертым аргументом можно задать тон (иконку и цвет).
 * В отличие от Alert, работает и в веб-сборке.
 */
export function appAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  tone?: DialogTone
): void {
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  queue = [...queue, { id: nextId++, title, message, buttons: list, tone: tone ?? inferTone(list) }];
  emit();
}

const TONE_ICONS: Record<DialogTone, React.ComponentProps<typeof Ionicons>['name']> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'alert-circle',
  info: 'information-circle',
};

/** Показывает диалоги из очереди по одному. Размещается один раз в корне приложения. */
export const DialogHost: React.FC = () => {
  const { theme, t } = useApp();
  const [items, setItems] = useState<DialogRequest[]>(queue);

  useEffect(() => {
    listeners.add(setItems);
    // Диалоги, запрошенные до подписки (например, при запуске), не теряем
    setItems(queue);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];

  const close = (action?: () => void) => {
    queue = queue.filter(item => item.id !== current?.id);
    emit();
    // Действие запускаем после закрытия, чтобы оно могло открыть следующий диалог
    action?.();
  };

  if (!current) return null;

  const toneColor = {
    success: theme.success,
    error: theme.danger,
    warning: theme.warning,
    info: theme.primary,
  }[current.tone];

  // Кнопка отмены — слева, основное действие — справа
  const ordered = [
    ...current.buttons.filter(b => b.style === 'cancel'),
    ...current.buttons.filter(b => b.style !== 'cancel'),
  ];
  const cancelButton = current.buttons.find(b => b.style === 'cancel');
  const stacked = ordered.length > 2;

  return (
    <AppModal
      visible={true}
      variant="center"
      onRequestClose={() => close(cancelButton?.onPress)}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: toneColor + '22' }]}>
            <Ionicons name={TONE_ICONS[current.tone]} size={30} color={toneColor} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{current.title}</Text>
          {current.message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{current.message}</Text>
          ) : null}

          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {ordered.map((b, index) => {
              const isCancel = b.style === 'cancel';
              const isDestructive = b.style === 'destructive';
              const bg = isCancel ? theme.surfaceLight : isDestructive ? theme.danger : theme.primary;
              const fg = isCancel ? theme.text : isDestructive ? '#FFFFFF' : theme.onPrimary;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.button, !stacked && styles.buttonFlex, { backgroundColor: bg }]}
                  onPress={() => close(b.onPress)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buttonText, { color: fg }]} numberOfLines={2}>
                    {b.text || t('common.ok')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xxl,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    alignSelf: 'stretch',
  },
  buttonsStacked: {
    flexDirection: 'column',
  },
  button: {
    ...button.md,
    paddingHorizontal: 12,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonText: {
    ...buttonText.md,
    textAlign: 'center',
  },
});

/** Сообщение об успешном действии */
export function appSuccess(title: string, message?: string, buttons?: DialogButton[]): void {
  appAlert(title, message, buttons, 'success');
}

/** Сообщение об ошибке ввода или сохранения */
export function appError(title: string, message?: string, buttons?: DialogButton[]): void {
  appAlert(title, message, buttons, 'error');
}
