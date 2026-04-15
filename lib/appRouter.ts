import { router as expoRouter } from "expo-router";
import type { Href } from "expo-router";

// ─── Module-level Navigation Guard ───────────────────────────────────────────

const THROTTLE_MS = 700;

let lastRoute = "";
let lastTime = 0;

export function canNavigateTo(route: string): boolean {
  const now = Date.now();
  if (route === lastRoute && now - lastTime < THROTTLE_MS) {
    return false;
  }
  lastRoute = route;
  lastTime = now;
  return true;
}

export function resetNavigationGuard() {
  lastRoute = "";
  lastTime = 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hrefToString(href: Href): string {
  if (typeof href === "string") return href;
  if (typeof href === "object" && href !== null && "pathname" in href) {
    return href.pathname ?? "";
  }
  return String(href);
}

/**
 * Drop-in replacement for the imperative `router` object from expo-router.
 *
 * Any call to `push()` or `navigate()` targeting the same route within 700 ms
 * of the previous call is silently dropped to prevent duplicate stacked pages.
 */
export const appRouter = {
  ...expoRouter,
  push(href: Href) {
    const route = hrefToString(href);
    if (canNavigateTo(route)) {
      expoRouter.push(href);
    }
  },
  navigate(href: Href) {
    const route = hrefToString(href);
    if (canNavigateTo(route)) {
      (expoRouter.navigate as (href: Href) => void)(href);
    }
  },
};
