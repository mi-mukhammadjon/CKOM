// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite в веб-сборке подключает wa-sqlite.wasm — Metro должен считать его ассетом
config.resolver.assetExts.push('wasm');

module.exports = config;
