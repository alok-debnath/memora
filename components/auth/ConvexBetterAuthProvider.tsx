import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthTokenFetcher } from "convex/browser";
import { ConvexProviderWithAuth } from "convex/react";

import { authClient } from "@/lib/auth-client";
import { logDevError } from "@/lib/devLog";

// Keep this wrapper local until @convex-dev/better-auth exports a stable
// React client interface that matches the current Better Auth instances.
type SupportedAuthClient = typeof authClient;

type ProviderProps = {
  children: ReactNode;
  client: {
    setAuth(
      fetchToken: AuthTokenFetcher,
      onChange: (isAuthenticated: boolean) => void,
      onRefreshChange?: (isRefreshing: boolean) => void,
    ): void;
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

function useBetterAuth(authClient: SupportedAuthClient, initialToken?: string | null) {
  const initialTokenRef = useRef(initialToken ?? null);

  return useMemo(
    () =>
      function useAuthFromBetterAuth() {
        const [cachedToken, setCachedToken] = useState<string | null>(() => {
          const token = initialTokenRef.current;
          initialTokenRef.current = null;
          return token;
        });
        const cachedTokenRef = useRef<string | null>(cachedToken);
        const pendingTokenRef = useRef<Promise<string | null> | null>(null);
        const { data: session, isPending: isSessionPending } = authClient.useSession();
        const sessionId = session?.session?.id;
        const hasSession = Boolean(session?.session);
        const previousSessionIdRef = useRef<string | undefined>(sessionId);

        const updateCachedToken = useCallback((token: string | null) => {
          cachedTokenRef.current = token;
          setCachedToken(token);
        }, []);

        useEffect(() => {
          if (!session && !isSessionPending && cachedToken) {
            updateCachedToken(null);
          }
        }, [cachedToken, isSessionPending, session, updateCachedToken]);

        useEffect(() => {
          if (previousSessionIdRef.current !== sessionId) {
            previousSessionIdRef.current = sessionId;
            updateCachedToken(null);
            pendingTokenRef.current = null;
          }
        }, [sessionId, updateCachedToken]);

        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
            if (cachedTokenRef.current && !forceRefreshToken) {
              return cachedTokenRef.current;
            }
            if (!forceRefreshToken && pendingTokenRef.current) {
              return pendingTokenRef.current;
            }

            pendingTokenRef.current = authClient.convex
              .token({ fetchOptions: { throw: false } })
              .then((result) => {
                const token = "data" in result ? (result.data?.token ?? null) : null;
                updateCachedToken(token);
                return token;
              })
              .catch(() => {
                updateCachedToken(null);
                return null;
              })
              .finally(() => {
                pendingTokenRef.current = null;
              });

            return pendingTokenRef.current;
          },
          [authClient, sessionId, updateCachedToken],
        );

        return useMemo(
          () => ({
            isLoading: isSessionPending && !cachedToken,
            isAuthenticated: hasSession || cachedToken !== null,
            fetchAccessToken,
          }),
          [cachedToken, fetchAccessToken, hasSession, isSessionPending],
        );
      },
    [authClient, initialToken],
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
      try {
        if (
          typeof window === "undefined" ||
          !window.location?.href ||
          !hasCrossDomain(authClient)
        ) {
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
      } catch (error) {
        logDevError("ConvexBetterAuthProvider.crossDomain", error);
      }
    })();
  }, [authClient]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
