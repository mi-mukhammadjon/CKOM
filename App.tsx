import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  ToastAndroid,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { Header } from './src/components/Header';
import { CustomTabBar, TabType } from './src/components/CustomTabBar';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ReadingEntryScreen } from './src/screens/ReadingEntryScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { TariffsScreen } from './src/screens/TariffsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { DialogHost } from './src/components/AppDialog';
import { RecoveryPrompt } from './src/components/RecoverySection';
import { Meter } from './src/types';
import {
  useFonts,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
} from '@expo-google-fonts/onest';

const MainNavigator: React.FC = () => {
  const { theme, isDark, loading, t } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedMeterForEntry, setSelectedMeterForEntry] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Пока открыта клавиатура, нижняя панель прячется и отдает место полям ввода
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Системная кнопка «Назад»: сначала на главный экран, выход — двойным нажатием.
  // Открытые модальные окна закрываются сами через onRequestClose.
  const lastBackPress = useRef(0);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSettings) {
        setShowSettings(false);
        return true;
      }
      if (activeTab !== 'dashboard') {
        setSelectedMeterForEntry(undefined);
        setActiveTab('dashboard');
        return true;
      }
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        return false; // система закрывает приложение
      }
      lastBackPress.current = now;
      ToastAndroid.show(t('app.pressAgainToExit'), ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [activeTab, showSettings, t]);

  // Кнопка «+» на виджете открывает приложение по ссылке ckom://entry
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (url && url.startsWith('ckom://entry')) {
        setSelectedMeterForEntry(undefined);
        setShowSettings(false);
        setActiveTab('entry');
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const handleOpenEntryWithMeter = (meter?: Meter) => {
    setSelectedMeterForEntry(meter ? meter.id : undefined);
    setActiveTab('entry');
    setShowSettings(false);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Persistent App Header */}
      <Header
        settingsOpen={showSettings}
        onOpenSettings={() => setShowSettings(prev => !prev)}
      />

      {/*
        Экран и панель вкладок поднимаются над клавиатурой. Режим padding работает
        и на Android: KeyboardAvoidingView сам считает перекрытие, поэтому, если система
        уже уменьшила окно, лишнего отступа не будет.
      */}
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardArea}>
        {/* Screen Body */}
        <View style={[styles.screenContainer, { backgroundColor: theme.background }]}>
          {showSettings ? (
            <SettingsScreen />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardScreen
                  onNavigateToEntry={handleOpenEntryWithMeter}
                  onNavigateToHistory={() => setActiveTab('history')}
                  onNavigateToTariffs={() => setActiveTab('tariffs')}
                />
              )}

              {activeTab === 'entry' && (
                <ReadingEntryScreen
                  initialMeterId={selectedMeterForEntry}
                  onSuccess={() => {
                    setSelectedMeterForEntry(undefined);
                    setActiveTab('dashboard');
                  }}
                  onCancel={() => {
                    setSelectedMeterForEntry(undefined);
                    setActiveTab('dashboard');
                  }}
                />
              )}

              {activeTab === 'history' && (
                <HistoryScreen onOpenReports={() => setActiveTab('reports')} />
              )}

              {activeTab === 'tariffs' && <TariffsScreen />}

              {activeTab === 'analytics' && (
                <AnalyticsScreen onOpenReports={() => setActiveTab('reports')} />
              )}

              {activeTab === 'reports' && <ReportsScreen />}
            </>
          )}
        </View>

        {/* Bottom Floating/Fixed Tab Navigation */}
        {!keyboardVisible && (
          <CustomTabBar
            activeTab={showSettings ? ('dashboard' as TabType) : activeTab}
            onSelectTab={(tab) => {
              setShowSettings(false);
              setActiveTab(tab);
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default function App() {
  // Шрифты лежат внутри приложения — загрузка мгновенная и без интернета
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={[styles.loadingContainer, { backgroundColor: '#0E0F12' }]} />;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <MainNavigator />
        <DialogHost />
        <RecoveryPrompt />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  keyboardArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
