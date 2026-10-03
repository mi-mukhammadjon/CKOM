import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Виджеты рабочего стола есть только на Android
if (Platform.OS === 'android') {
  const {
    registerWidgetConfigurationScreen,
    registerWidgetTaskHandler,
  } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/taskHandler');
  const { WidgetConfigScreen } = require('./src/widgets/WidgetConfigScreen');

  registerWidgetTaskHandler(widgetTaskHandler);
  registerWidgetConfigurationScreen(WidgetConfigScreen);
}
