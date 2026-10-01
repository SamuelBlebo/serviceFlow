// Expo's default Metro config detects the pnpm workspace (monorepo) automatically.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
