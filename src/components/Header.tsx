import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { font, fontSize, button, radius } from '../constants/theme';
import { AppModal } from './AppModal';

const APP_LOGO = require('../../assets/icon.png');

interface HeaderProps {
  onOpenSettings?: () => void;
  /** Настройки открыты: шестеренка превращается в крестик */
  settingsOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, settingsOpen = false }) => {
  const { theme, isDark, activeProperty, properties, setActivePropertyId, updateSettings, t } = useApp();
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // 0 — шестеренка, 1 — крестик; иконки сменяют друг друга с поворотом
  const morph = useRef(new Animated.Value(settingsOpen ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(morph, {
      toValue: settingsOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [settingsOpen, morph]);

  const gearStyle = {
    opacity: morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ rotate: morph.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }],
  };
  const closeStyle = {
    opacity: morph,
    transform: [{ rotate: morph.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }],
  };

  const toggleTheme = () => {
    updateSettings({ theme: isDark ? 'light' : 'dark' });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.left}>
        <Image source={APP_LOGO} style={styles.logo} />
        <TouchableOpacity
          style={styles.propertyButton}
          onPress={() => setShowPropertyPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.propertyLabel, { color: theme.textMuted }]}>
            {t('header.propertyLabel')}
          </Text>
          <View style={styles.propertyRow}>
            <Text style={[styles.propertyName, { color: theme.text }]} numberOfLines={1}>
              {activeProperty.name}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.rightActions}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceLight }]}
          onPress={toggleTheme}
          activeOpacity={0.7}
          accessibilityLabel={t('header.toggleTheme')}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        {onOpenSettings && (
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.surfaceLight }]}
            onPress={onOpenSettings}
            activeOpacity={0.7}
            accessibilityLabel={settingsOpen ? t('common.close') : t('header.openSettings')}
          >
            <Animated.View style={[styles.morphIcon, gearStyle]}>
              <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
            </Animated.View>
            <Animated.View style={[styles.morphIcon, closeStyle]}>
              <Ionicons name="close" size={22} color={theme.text} />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* Property Switcher Modal */}
      <AppModal
        visible={showPropertyPicker}
        variant="center"
        onRequestClose={() => setShowPropertyPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPropertyPicker(false)}
        >
          <View style={[styles.pickerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>{t('header.pickProperty')}</Text>
            <Text style={[styles.pickerSubtitle, { color: theme.textSecondary }]}>
              {t('header.pickPropertyHint')}
            </Text>

            <View style={styles.propertyList}>
              {properties.map(p => {
                const isSelected = p.id === activeProperty.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.propertyItem,
                      {
                        backgroundColor: isSelected ? theme.badgeBg : theme.surfaceLight,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => {
                      setActivePropertyId(p.id);
                      setShowPropertyPicker(false);
                    }}
                  >
                    <Ionicons
                      name="business"
                      size={20}
                      color={isSelected ? theme.primary : theme.textSecondary}
                    />
                    <View style={styles.propertyInfo}>
                      <Text
                        style={[
                          styles.propertyItemName,
                          { color: isSelected ? theme.primary : theme.text, fontFamily: isSelected ? font.bold : font.medium },
                        ]}
                      >
                        {p.name}
                      </Text>
                      {p.address ? (
                        <Text style={[styles.propertyItemAddress, { color: theme.textMuted }]} numberOfLines={1}>
                          {p.address}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.closePickerBtn, { backgroundColor: theme.surfaceLight }]}
              onPress={() => setShowPropertyPicker(false)}
            >
              <Text style={[styles.closePickerText, { color: theme.text }]}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </AppModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
  },
  propertyButton: {
    flexShrink: 1,
  },
  propertyLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  propertyName: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
    maxWidth: 200,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    ...button.icon,
  },
  // Обе иконки лежат друг на друге в центре кнопки
  morphIcon: {
    position: 'absolute',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
  },
  pickerSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: font.regular,
    marginTop: 4,
    marginBottom: 16,
  },
  propertyList: {
    gap: 10,
    marginBottom: 16,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  propertyInfo: {
    flex: 1,
  },
  propertyItemName: {
    fontSize: fontSize.md,
    fontFamily: font.regular,
  },
  propertyItemAddress: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginTop: 2,
  },
  closePickerBtn: {
    ...button.md,
  },
  closePickerText: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
  },
});
