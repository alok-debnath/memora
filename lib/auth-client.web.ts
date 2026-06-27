import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [convexClient(), crossDomainClient()],
});
