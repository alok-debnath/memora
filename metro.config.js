const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Fall back to Metro's Node crawler so local Watchman/inotify limits
// do not crash `expo start` or `expo run:*`.
config.resolver.useWatchman = false;

module.exports = config;
