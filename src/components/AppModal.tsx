import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet } from 'react-native';
import { OVERLAY_BG } from '../constants/theme';

interface AppModalProps {
  visible: boolean;
  onRequestClose: () => void;
  /** sheet — выезжает снизу, center — появляется по центру */
  variant?: 'sheet' | 'center';
  children: React.ReactNode;
}

/**
 * Модальное окно приложения. Затемнение стоит на месте и только плавно проявляется,
 * а движется одна карточка. Системная анимация slide двигала вместе с окном
 * и затемнение — темная полоса «выплывала» снизу.
 */
export const AppModal: React.FC<AppModalProps> = ({
  visible,
  onRequestClose,
  variant = 'center',
  children,
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const contentMotion =
    variant === 'sheet'
      ? {
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }) },
          ],
        }
      : {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        };

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY_BG, opacity: progress }]}
      />
      <Animated.View style={[styles.content, contentMotion]}>{children}</Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
