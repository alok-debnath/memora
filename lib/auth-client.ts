import { Platform } from "react-native";

type NativeAuthModule = typeof import("./auth-client.native");
type WebAuthModule = typeof import("./auth-client.web");

const authModule: NativeAuthModule | WebAuthModule =
  Platform.OS === "web" ? require("./auth-client.web") : require("./auth-client.native");

export const authClient = authModule.authClient;
