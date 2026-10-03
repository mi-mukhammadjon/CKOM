import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { font, fontSize, radius } from '../constants/theme';

export type TabType = 'dashboard' | 'entry' | 'history' | 'tariffs' | 'analytics' | 'reports';

interface CustomTabBarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const CustomTabBar: React.FC<CustomTabBarProps> = ({ activeTab, onSelectTab }) => {
  const { theme, t } = useApp();

  // Ввод показаний — центральная кнопка, остальные разделы по бокам
  const tabs: { id: TabType; label: string; icon: IconName; iconActive: IconName }[] = [
    { id: 'dashboard', label: t('tab.dashboard'), icon: 'home-outline', iconActive: 'home' },
    { id: 'history', label: t('tab.history'), icon: 'receipt-outline', iconActive: 'receipt' },
    { id: 'entry', label: t('tab.entry'), icon: 'add', iconActive: 'add' },
    { id: 'analytics', label: t('tab.analytics'), icon: 'bar-chart-outline', iconActive: 'bar-chart' },
    { id: 'tariffs', label: t('tab.tariffs'), icon: 'pricetags-outline', iconActive: 'pricetags' },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.tabBarBg, borderColor: theme.tabBarBorder },
      ]}
    >
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;

        if (tab.id === 'entry') {
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabBtn}
              onPress={() => onSelectTab(tab.id)}
              activeOpacity={0.85}
              accessibilityLabel={tab.label}
            >
              <View style={[styles.plus, { backgroundColor: theme.primary }]}>
                <Ionicons name="add" size={28} color={theme.onPrimary} />
              </View>
            </TouchableOpacity>
          );
        }

        const color = isActive ? theme.text : theme.textMuted;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabBtn}
            onPress={() => onSelectTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons name={isActive ? tab.iconActive : tab.icon} size={22} color={color} />
            <Text
              style={[styles.tabLabel, { color, fontFamily: isActive ? font.bold : font.medium }]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.xxl,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#020A24',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  plus: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: fontSize.xs,
  },
});
