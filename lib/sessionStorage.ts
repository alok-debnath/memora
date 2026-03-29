import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "auth_token";
const ONBOARDING_KEY = "has_seen_onboarding";

async function getSecureStoreAvailability() {
  if (Platform.OS === "web") {
    return false;
  }
  return SecureStore.isAvailableAsync();
}

export async function getSessionToken() {
  if (await getSecureStoreAvailability()) {
    return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  }
  return AsyncStorage.getItem(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token: string) {
  if (await getSecureStoreAvailability()) {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    return;
  }
  await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken() {
  if (await getSecureStoreAvailability()) {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    return;
  }
  await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function getHasSeenOnboarding() {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === "true";
}

export async function setHasSeenOnboarding() {
  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
}
