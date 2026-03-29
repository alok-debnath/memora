import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

type ThemeMode = "system" | "light" | "dark";
type ResolvedThemeMode = "light" | "dark";

interface ThemeStore {
  mode: ThemeMode;
  systemMode: ResolvedThemeMode;
  resolvedMode: ResolvedThemeMode;
  hasLoaded: boolean;
  setMode: (mode: ThemeMode) => void;
  setSystemMode: (mode: ResolvedThemeMode) => void;
  loadTheme: () => Promise<void>;
}

function resolveMode(
  mode: ThemeMode,
  systemMode: ResolvedThemeMode
): ResolvedThemeMode {
  return mode === "system" ? systemMode : mode;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: "system",
  systemMode: "light",
  resolvedMode: "light",
  hasLoaded: false,
  setMode: (mode) => {
    set((state) => ({
      mode,
      resolvedMode: resolveMode(mode, state.systemMode),
    }));
    AsyncStorage.setItem("theme_mode", mode);
  },
  setSystemMode: (systemMode) => {
    set((state) => ({
      systemMode,
      resolvedMode: resolveMode(state.mode, systemMode),
    }));
  },
  loadTheme: async () => {
    try {
      const stored = await AsyncStorage.getItem("theme_mode");
      const fallback = get().systemMode;
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({
          mode: stored,
          resolvedMode: resolveMode(stored, fallback),
          hasLoaded: true,
        });
      } else {
        set({
          mode: "system",
          resolvedMode: fallback,
          hasLoaded: true,
        });
      }
    } catch {
      set((state) => ({
        hasLoaded: true,
        resolvedMode: resolveMode(state.mode, state.systemMode),
      }));
    }
  },
}));
