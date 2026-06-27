import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthTokenFetcher } from "convex/browser";
import { ConvexProviderWithAuth } from "convex/react";

import { authClient } from "@/lib/auth-client";

// Keep this wrapper local until @convex-dev/better-auth exports a stable
// React client interface that matches the current Better Auth instances.
type SupportedAuthClient = typeof authClient;

type ProviderProps = {
  children: ReactNode;
  client: {
    setAuth(fetchToken: AuthTokenFetcher): void;
    clearAuth(): void;
  };
  authClient: SupportedAuthClient;
  initialToken?: string | null;
};

function hasCrossDomain(authClient: SupportedAuthClient): authClient is SupportedAuthClient & {
  crossDomain: {
    oneTimeToken: {
      verify(args: { token: string }): Promise<{ data?: { session?: { token: string } } }>;
    };
  };
  updateSession(): void;
} {
  return "crossDomain" in authClient && "updateSession" in authClient;
}

let initialTokenUsed = false;

function useBetterAuth(authClient: SupportedAuthClient, initialToken?: string | null) {
  const [cachedToken, setCachedToken] = useState<string | null>(
    initialTokenUsed ? null : (initialToken ?? null),
  );
  const pendingTokenRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (!initialTokenUsed) {
      initialTokenUsed = true;
    }
  }, []);

  return useMemo(
    () =>
      function useAuthFromBetterAuth() {
        const { data: session, isPending: isSessionPending } = authClient.useSession();
        const sessionId = session?.session?.id;

        useEffect(() => {
          if (!session && !isSessionPending && cachedToken) {
            setCachedToken(null);
          }
        }, [cachedToken, isSessionPending, session]);

        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
            if (cachedToken && !forceRefreshToken) {
              return cachedToken;
            }
            if (!forceRefreshToken && pendingTokenRef.current) {
              return pendingTokenRef.current;
            }

            pendingTokenRef.current = authClient.convex
              .token({ fetchOptions: { throw: false } })
              .then((result) => {
                const token = "data" in result ? (result.data?.token ?? null) : null;
                setCachedToken(token);
                return token;
              })
              .catch(() => {
                setCachedToken(null);
                return null;
              })
              .finally(() => {
                pendingTokenRef.current = null;
              });

            return pendingTokenRef.current;
          },
          [authClient, cachedToken, sessionId],
        );

        return useMemo(
          () => ({
            isLoading: isSessionPending && !cachedToken,
            isAuthenticated: Boolean(session?.session) || cachedToken !== null,
            fetchAccessToken,
          }),
          [cachedToken, fetchAccessToken, isSessionPending, sessionId, session],
        );
      },
    [authClient, cachedToken, initialToken],
  );
}

export function ConvexBetterAuthProvider({
  children,
  client,
  authClient,
  initialToken,
}: ProviderProps) {
  const useAuth = useBetterAuth(authClient, initialToken);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !window.location?.href || !hasCrossDomain(authClient)) {
        return;
      }

      const url = new URL(window.location.href);
      const token = url.searchParams.get("ott");
      if (!token) {
        return;
      }

      url.searchParams.delete("ott");
      window.history.replaceState({}, "", url);

      const result = await authClient.crossDomain.oneTimeToken.verify({ token });
      const session = result.data?.session;
      if (!session) {
        return;
      }

      await authClient.getSession({
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      });
      authClient.updateSession();
    })();
  }, [authClient]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
