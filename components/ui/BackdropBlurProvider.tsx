import { BlurTargetView } from "expo-blur";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

type OverlayHostContextValue = {
  blurTargetRef: React.RefObject<View | null>;
  setOverlay: (id: string, node: React.ReactNode) => void;
  removeOverlay: (id: string) => void;
};

function createOverlayHost() {
  const Context = createContext<OverlayHostContextValue | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const blurTargetRef = useRef<View | null>(null);
    const [overlays, setOverlays] = useState<Record<string, React.ReactNode>>({});

    const setOverlay = useCallback((id: string, node: React.ReactNode) => {
      setOverlays((current) => {
        if (current[id] === node) return current;
        return { ...current, [id]: node };
      });
    }, []);

    const removeOverlay = useCallback((id: string) => {
      setOverlays((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, []);

    const value = useMemo<OverlayHostContextValue>(
      () => ({ blurTargetRef, setOverlay, removeOverlay }),
      [removeOverlay, setOverlay],
    );

    return (
      <Context.Provider value={value}>
        <View style={styles.root}>
          <BlurTargetView ref={blurTargetRef} style={styles.root}>
            {children}
          </BlurTargetView>
          {Object.entries(overlays).map(([id, node]) => (
            <React.Fragment key={id}>{node}</React.Fragment>
          ))}
        </View>
      </Context.Provider>
    );
  }

  function useHost() {
    return useContext(Context);
  }

  return { Provider, useHost };
}

// Tab bar overlay: must stay BELOW bottom sheets (a sheet should cover it),
// so this provider mounts inside BottomSheetModalProvider in app/_layout.tsx.
const tabBarHost = createOverlayHost();
export const BackdropBlurProvider = tabBarHost.Provider;
export const useBackdropBlurHost = tabBarHost.useHost;

// Context menu overlay: must render ABOVE bottom sheets (menus are triggered
// by content living inside a sheet), so this provider mounts outside
// BottomSheetModalProvider in app/_layout.tsx — a separate stacking layer
// from the tab bar host above.
const topOverlayHost = createOverlayHost();
export const TopOverlayProvider = topOverlayHost.Provider;
export const useTopOverlayHost = topOverlayHost.useHost;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
