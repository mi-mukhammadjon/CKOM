// Динамическая часть конфигурации поверх app.json.
// EXPO_BASE_URL задает путь веб-версии на GitHub Pages (например, /KCOM),
// для APK и локального запуска он пустой.
//
// Версия задается в одном месте — "version" в app.json. Код версии для Android
// выводится из нее: 1.3.0 → 10300, 1.12.4 → 11204. Так он всегда растет.
function versionCodeOf(version) {
  const [major = 0, minor = 0, patch = 0] = String(version).split('.').map(n => parseInt(n, 10) || 0);
  return major * 10000 + minor * 100 + patch;
}

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...(config.android || {}),
    versionCode: versionCodeOf(config.version),
  },
  plugins: [...(config.plugins || []), './plugins/withReleaseSigning'],
  experiments: {
    ...(config.experiments || {}),
    baseUrl: process.env.EXPO_BASE_URL || '',
  },
});

module.exports.versionCodeOf = versionCodeOf;
