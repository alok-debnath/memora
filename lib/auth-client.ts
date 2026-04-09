import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const APP_SCHEME = "memora";
const AUTH_STORAGE_PREFIX = "memora";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    ...(Platform.OS === "web"
      ? [crossDomainClient()]
      : [
          expoClient({
            scheme: APP_SCHEME,
            storagePrefix: AUTH_STORAGE_PREFIX,
            storage: SecureStore,
          }),
        ]),
  ],
});
