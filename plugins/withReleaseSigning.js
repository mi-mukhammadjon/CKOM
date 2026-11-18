// Подпись release-сборки собственным ключом.
//
// Если при сборке заданы переменные CKOM_UPLOAD_STORE_FILE, CKOM_UPLOAD_STORE_PASSWORD,
// CKOM_UPLOAD_KEY_ALIAS и CKOM_UPLOAD_KEY_PASSWORD, APK подписывается этим ключом.
// Без них остается прежняя подпись (debug.keystore), чтобы уже установленные
// копии приложения продолжали обновляться. Подробности — в DEPLOY.md.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// ckom-release-signing';

const RELEASE_CONFIG = `
        release { ${MARKER}
            def ckomStore = System.getenv('CKOM_UPLOAD_STORE_FILE')
            if (ckomStore) {
                storeFile file(ckomStore)
                storePassword System.getenv('CKOM_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('CKOM_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('CKOM_UPLOAD_KEY_PASSWORD')
            }
        }`;

function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const withConfig = gradle.replace(/signingConfigs\s*\{/, match => `${match}${RELEASE_CONFIG}`);
  if (withConfig === gradle) throw new Error('withReleaseSigning: не найден блок signingConfigs');

  // В блоке release заменяем только его собственную подпись
  const releaseBlock = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  const result = withConfig.replace(
    releaseBlock,
    `$1signingConfig System.getenv('CKOM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
  );
  if (result === withConfig) throw new Error('withReleaseSigning: не найдена подпись release-сборки');
  return result;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withReleaseSigning: ожидается build.gradle на Groovy');
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applySigning = applySigning;
