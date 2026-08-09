const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Fix EXPO_ROUTER_APP_ROOT error in monorepo setups
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
