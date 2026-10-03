// Динамическая часть конфигурации поверх app.json.
// EXPO_BASE_URL задает путь веб-версии на GitHub Pages (например, /KCOM),
// для APK и локального запуска он пустой.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments || {}),
    baseUrl: process.env.EXPO_BASE_URL || '',
  },
});
