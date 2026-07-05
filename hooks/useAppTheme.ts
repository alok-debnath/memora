import React, { createContext, useContext, useMemo } from "react";
import type { Variable } from "tamagui";

import { createThemeColors, type ThemeColorValues } from "@/constants/themePalettes";
import { useThemeStore } from "@/store/theme";

type ThemeToken = Variable<string> & {
  val: string;
  get: (platform?: "web") => string;
};

export type AppTheme = {
  [K in keyof ThemeColorValues]: ThemeToken;
};

function createThemeToken(value: string): ThemeToken {
  return {
    val: value,
    variable: value,
    name: value,
    isVariable: true,
    get: () => value,
  } as unknown as ThemeToken;
}

function buildAppTheme(colors: ThemeColorValues): AppTheme {
  const theme = {} as AppTheme;
  for (const key of Object.keys(colors) as Array<keyof ThemeColorValues>) {
    theme[key] = createThemeToken(colors[key]);
  }
  return theme;
}

const AppThemeContext = createContext<AppTheme | null>(null);

// Palette generation (hex<->hsl math across ~30 keys) is real work — computing it
// once here and sharing the result via context avoids every one of the ~100
// useAppTheme() call sites redoing the same math on every accent/mode change.
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const resolvedAccentColor = useThemeStore((state) => state.resolvedAccentColor);

  const theme = useMemo(
    () => buildAppTheme(createThemeColors(resolvedAccentColor, resolvedMode)),
    [resolvedAccentColor, resolvedMode],
  );

  return React.createElement(AppThemeContext.Provider, { value: theme }, children);
}

export function useAppTheme(): AppTheme {
  const theme = useContext(AppThemeContext);
  if (!theme) {
    throw new Error("useAppTheme() must be called within an AppThemeProvider");
  }
  return theme;
}
