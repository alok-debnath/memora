import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const APP_SCHEME = "memora";
const AUTH_STORAGE_PREFIX = "memora";

const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

export const webAuthClient = createAuthClient({
  baseURL,
  plugins: [convexClient(), crossDomainClient()],
});

export const nativeAuthClient = createAuthClient({
  baseURL,
  plugins: [
    convexClient(),
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: AUTH_STORAGE_PREFIX,
      storage: SecureStore,
    }),
  ],
});

export const authClient = Platform.OS === "web" ? webAuthClient : nativeAuthClient;
