import type { ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

const config: ExpoConfig = {
  name: IS_DEV ? "Memora (Dev)" : "Memora",
  slug: "memora",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "memora-dev" : "memora",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? "com.alokdebnath.memora.dev" : "com.alokdebnath.memora",
    infoPlist: {
      NSSpeechRecognitionUsageDescription: "Allow Memora to transcribe your speech in real time.",
      NSMicrophoneUsageDescription: "Allow Memora to use the microphone for voice dictation.",
    },
  },
  android: {
    package: IS_DEV ? "com.alokdebnath.memora.dev" : "com.alokdebnath.memora",
    permissions: ["android.permission.RECORD_AUDIO"],
  },
  web: {
    favicon: "./assets/images/icon.png",
  },
  plugins: [
    "expo-dev-client",
    "expo-router",
    "expo-font",
    "expo-web-browser",
    [
      "expo-speech-recognition",
      {
        microphonePermission: "Allow Memora to use the microphone for voice dictation.",
        speechRecognitionPermission: "Allow Memora to transcribe your speech in real time.",
        androidSpeechServicePackages: [
          "com.google.android.as",
          "com.google.android.tts",
          "com.google.android.googlequicksearchbox",
        ],
      },
    ],
    "expo-secure-store",
    "expo-image",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#E8911B",
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
