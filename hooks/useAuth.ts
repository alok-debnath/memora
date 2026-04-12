import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { getHasSeenOnboarding, setHasSeenOnboarding } from "@/lib/sessionStorage";

interface AuthUser {
  _id: Id<"users">;
  email: string;
  name: string;
  timezone?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  hasSeenOnboarding: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setOnboardingSeen: () => void;
}

export type AuthContextValue = AuthState & AuthActions;

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthState(): AuthContextValue {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const convexAuth = useConvexAuth();
  const syncSessionUser = useMutation(api.auth.syncSessionUser);
  const [hasSeenOnboarding, setHasSeenOnboardingState] = useState(false);
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    getHasSeenOnboarding()
      .then((value) => setHasSeenOnboardingState(value))
      .finally(() => setOnboardingLoaded(true));
  }, []);

  const sessionId = session?.session?.id ?? null;

  useEffect(() => {
    if (!convexAuth.isAuthenticated || !sessionId) {
      syncedSessionRef.current = null;
      setIsSyncing(false);
      return;
    }
    if (syncedSessionRef.current === sessionId) {
      return;
    }

    setIsSyncing(true);
    syncSessionUser({})
      .then(() => {
        syncedSessionRef.current = sessionId;
      })
      .finally(() => setIsSyncing(false));
  }, [convexAuth.isAuthenticated, sessionId, syncSessionUser]);

  const meResult = useQuery(
    api.auth.me,
    convexAuth.isAuthenticated && syncedSessionRef.current === sessionId
      ? { token: "authenticated" }
      : "skip",
  );

  const login = useCallback(async (email: string, password: string) => {
    const result = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
      rememberMe: true,
    });
    if (result.error) {
      throw new Error(result.error.message || "Login failed");
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    if (result.error) {
      throw new Error(result.error.message || "Signup failed");
    }
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
    syncedSessionRef.current = null;
  }, []);

  const setOnboardingSeen = useCallback(() => {
    setHasSeenOnboardingState(true);
    setHasSeenOnboarding().catch(() => undefined);
  }, []);

  return {
    user: (meResult as AuthUser | null | undefined) ?? null,
    token: convexAuth.isAuthenticated ? "authenticated" : null,
    isLoading:
      !onboardingLoaded ||
      sessionPending ||
      convexAuth.isLoading ||
      (convexAuth.isAuthenticated && (isSyncing || meResult === undefined)),
    hasSeenOnboarding,
    login,
    signup,
    logout,
    setOnboardingSeen,
  };
}
