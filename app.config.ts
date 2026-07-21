import type { ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

const config: ExpoConfig = {
  name: IS_DEV ? "Memora (Dev)" : "Memora",
  slug: "memora",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "memora-dev" : "memora",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? "com.alokdebnath.memora.dev" : "com.alokdebnath.memora",
    infoPlist: {
      NSSpeechRecognitionUsageDescription: "Allow Memora to transcribe your speech on device.",
      NSMicrophoneUsageDescription: "Allow Memora to use the microphone for voice dictation.",
    },
  },
  android: {
    package: IS_DEV ? "com.alokdebnath.memora.dev" : "com.alokdebnath.memora",
    permissions: ["android.permission.RECORD_AUDIO"],
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#101A33",
    },
  },
  web: {
    favicon: "./assets/images/icon.png",
  },
  plugins: [
    "expo-dev-client",
    "expo-router",
    "expo-font",
    "expo-asset",
    "expo-web-browser",
    [
      "@siteed/audio-studio",
      {
        enablePhoneStateHandling: false,
        enableNotifications: false,
        enableBackgroundAudio: false,
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission: "Allow Memora to use the microphone for voice dictation.",
        speechRecognitionPermission: "Allow Memora to transcribe your speech on device.",
        androidSpeechServicePackages: ["com.google.android.as"],
      },
    ],
    "expo-secure-store",
    "expo-image",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#101A33",
        dark: {
          backgroundColor: "#101A33",
        },
      },
    ],
    "expo-status-bar",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "62d01e27-1813-4acc-b600-77837c21bed1",
    },
  },
  owner: "alokdebnath",
};

export default config;
