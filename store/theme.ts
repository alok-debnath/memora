import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  MEMORA_ACCENT,
  isValidThemeHex,
  resolveAccentColor,
  type ResolvedThemeMode,
  type ThemeAccentSource,
  type ThemeMode,
} from "@/constants/themePalettes";

interface ThemeStore {
  mode: ThemeMode;
  systemMode: ResolvedThemeMode;
  resolvedMode: ResolvedThemeMode;
  accentSource: ThemeAccentSource;
  accentColor: string;
  customColor: string;
  resolvedAccentColor: string;
  hasLoaded: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccentSource: (source: ThemeAccentSource, color?: string) => void;
  setCustomColor: (color: string) => void;
  setSystemMode: (mode: ResolvedThemeMode) => void;
  loadTheme: () => Promise<void>;
}

function resolveMode(mode: ThemeMode, systemMode: ResolvedThemeMode): ResolvedThemeMode {
  return mode === "system" ? systemMode : mode;
}

function normalizeStoredAccent(value: string | null, fallback = MEMORA_ACCENT) {
  return value && isValidThemeHex(value) ? value.trim().toUpperCase() : fallback;
}

function normalizeAccentSource(value: string | null): ThemeAccentSource {
  if (value === "memora" || value === "preset" || value === "custom" || value === "androidSystem") {
    return value;
  }
  return "memora";
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: "system",
  systemMode: "light",
  resolvedMode: "light",
  accentSource: "memora",
  accentColor: MEMORA_ACCENT,
  customColor: MEMORA_ACCENT,
  resolvedAccentColor: MEMORA_ACCENT,
  hasLoaded: false,
  setMode: (mode) => {
    set((state) => ({
      mode,
      resolvedMode: resolveMode(mode, state.systemMode),
    }));
    AsyncStorage.setItem("theme_mode", mode);
  },
  setAccentSource: (accentSource, color) => {
    const fallback = accentSource === "memora" ? MEMORA_ACCENT : get().accentColor;
    const accentColor = normalizeStoredAccent(color ?? fallback, fallback);
    set({
      accentSource,
      accentColor,
      customColor: accentSource === "custom" ? accentColor : get().customColor,
      resolvedAccentColor: resolveAccentColor(accentSource, accentColor),
    });
    AsyncStorage.multiSet([
      ["theme_accent_source", accentSource],
      ["theme_accent_color", accentColor],
      ["theme_custom_color", accentSource === "custom" ? accentColor : get().customColor],
    ]);
  },
  setCustomColor: (color) => {
    const customColor = normalizeStoredAccent(color, get().customColor);
    set({
      accentSource: "custom",
      accentColor: customColor,
      customColor,
      resolvedAccentColor: resolveAccentColor("custom", customColor),
    });
    AsyncStorage.multiSet([
      ["theme_accent_source", "custom"],
      ["theme_accent_color", customColor],
      ["theme_custom_color", customColor],
    ]);
  },
  setSystemMode: (systemMode) => {
    set((state) => ({
      systemMode,
      resolvedMode: resolveMode(state.mode, systemMode),
      resolvedAccentColor: resolveAccentColor(state.accentSource, state.accentColor),
    }));
  },
  loadTheme: async () => {
    try {
      const entries = await AsyncStorage.multiGet([
        "theme_mode",
        "theme_accent_source",
        "theme_accent_color",
        "theme_custom_color",
      ]);
      const stored = entries[0]?.[1];
      const storedAccentSource = normalizeAccentSource(entries[1]?.[1] ?? null);
      const storedAccentColor = normalizeStoredAccent(entries[2]?.[1] ?? null);
      const storedCustomColor = normalizeStoredAccent(entries[3]?.[1] ?? null, storedAccentColor);
      const fallback = get().systemMode;
      const accentSource = storedAccentSource;
      const accentColor = accentSource === "memora" ? MEMORA_ACCENT : storedAccentColor;
      const customColor = storedCustomColor;
      const resolvedAccentColor = resolveAccentColor(accentSource, accentColor);
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({
          mode: stored,
          resolvedMode: resolveMode(stored, fallback),
          accentSource,
          accentColor,
          customColor,
          resolvedAccentColor,
          hasLoaded: true,
        });
      } else {
        set({
          mode: "system",
          resolvedMode: fallback,
          accentSource,
          accentColor,
          customColor,
          resolvedAccentColor,
          hasLoaded: true,
        });
      }
    } catch {
      set((state) => ({
        hasLoaded: true,
        resolvedMode: resolveMode(state.mode, state.systemMode),
        resolvedAccentColor: resolveAccentColor(state.accentSource, state.accentColor),
      }));
    }
  },
}));
