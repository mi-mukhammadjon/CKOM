// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'public/*'],
  },
  {
    // Правила React Compiler. Компилятор в проекте не включен, а анимации
    // (Animated.Value в useRef) и синхронизация формы с пропсами написаны
    // в обычном стиле React Native. Оставляем подсказками, а не ошибками,
    // и переводим в ошибки вместе с включением компилятора.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
    },
  },
]);
