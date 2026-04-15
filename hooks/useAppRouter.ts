import { useRouter } from "expo-router";
import { appRouter } from "@/lib/appRouter";

/**
 * Drop-in replacement for `useRouter()` that prevents duplicate page pushes.
 *
 * Any call to `push()` or `navigate()` targeting the same route within 700 ms
 * of the previous call is silently dropped. `replace()`, `back()`, and
 * `dismiss()` are forwarded as-is (they don't create duplicate pages).
 *
 * Usage:
 *   const router = useAppRouter();   // instead of useRouter()
 *   router.push("/some-screen");     // safe against double-taps
 */
export function useAppRouter() {
  const router = useRouter();

  return {
    ...router,
    push: appRouter.push,
    navigate: appRouter.navigate,
  } as ReturnType<typeof useRouter>;
}
