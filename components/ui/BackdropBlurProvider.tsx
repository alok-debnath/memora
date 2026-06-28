import { BlurTargetView } from "expo-blur";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

type OverlayHostContextValue = {
  blurTargetRef: React.RefObject<View | null>;
  setOverlay: (id: string, node: React.ReactNode) => void;
  removeOverlay: (id: string) => void;
};

const OverlayHostContext = createContext<OverlayHostContextValue | null>(null);

export function BackdropBlurProvider({ children }: { children: React.ReactNode }) {
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
    () => ({
      blurTargetRef,
      setOverlay,
      removeOverlay,
    }),
    [removeOverlay, setOverlay],
  );

  return (
    <OverlayHostContext.Provider value={value}>
      <View style={styles.root}>
        <BlurTargetView ref={blurTargetRef} style={styles.root}>
          {children}
        </BlurTargetView>
        {Object.entries(overlays).map(([id, node]) => (
          <React.Fragment key={id}>{node}</React.Fragment>
        ))}
      </View>
    </OverlayHostContext.Provider>
  );
}

export function useBackdropBlurHost() {
  return useContext(OverlayHostContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
