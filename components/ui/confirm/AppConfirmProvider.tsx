import { Feather } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";

type ConfirmTone = "default" | "destructive";

export interface AppConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: React.ComponentProps<typeof Feather>["name"];
  allowBackdropDismiss?: boolean;
}

interface AppConfirmContextValue {
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
}

interface ConfirmRequest extends Required<Omit<AppConfirmOptions, "message">> {
  message?: string;
}

const DEFAULT_OPTIONS = {
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  tone: "default" as ConfirmTone,
  icon: "alert-circle" as const,
  allowBackdropDismiss: true,
};

const AppConfirmContext = createContext<AppConfirmContextValue | null>(null);

export function AppConfirmProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: AppConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setRequest({
        ...DEFAULT_OPTIONS,
        ...options,
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const contextValue = useMemo(() => ({ confirm }), [confirm]);
  const toneColor =
    request?.tone === "destructive" ? theme.destructive.val : theme.primary.val;
  const iconName = request?.icon ?? DEFAULT_OPTIONS.icon;
  const useStackedActions = windowWidth < 480;
  const confirmTextColor = request?.tone === "destructive" ? "#FFFFFF" : "#1F160F";

  const cancelAction = (
    <Pressable
      onPress={() => close(false)}
      style={({ pressed }) => [useStackedActions ? styles.actionStacked : styles.actionInline, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.button,
          styles.buttonSecondary,
          {
            backgroundColor: theme.background.val,
            borderColor: theme.borderColor.val,
          },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: theme.color.val }]}>
          {request?.cancelLabel}
        </Text>
      </View>
    </Pressable>
  );

  const confirmAction = (
    <Pressable
      onPress={() => close(true)}
      style={({ pressed }) => [useStackedActions ? styles.actionStacked : styles.actionInline, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.button,
          styles.buttonPrimary,
          { backgroundColor: toneColor },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: confirmTextColor }]}>
          {request?.confirmLabel}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <AppConfirmContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={!!request}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => close(false)}
      >
        {request ? (
          <View
            style={[
              styles.overlay,
              {
                paddingTop: Math.max(insets.top, 24),
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (request.allowBackdropDismiss) close(false);
              }}
            />

            <View style={styles.dialogWrap}>
              <View
                style={[
                  styles.dialog,
                  {
                    backgroundColor: theme.card.val,
                    borderColor: theme.borderColor.val,
                    shadowColor: theme.shadowColor.val,
                  },
                ]}
              >
                <View style={styles.headerRow}>
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor: toneColor + "16",
                        borderColor: toneColor + "28",
                      },
                    ]}
                  >
                    <Feather name={iconName} size={20} color={toneColor} />
                  </View>

                  <View style={styles.copyCol}>
                    <Text style={[styles.title, { color: theme.color.val }]}>
                      {request.title}
                    </Text>
                    {request.message ? (
                      <Text style={[styles.message, { color: theme.colorMuted.val }]}>
                        {request.message}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={[styles.actions, useStackedActions ? styles.actionsColumn : styles.actionsRow]}>
                  {useStackedActions ? (
                    <>
                      {confirmAction}
                      {cancelAction}
                    </>
                  ) : (
                    <>
                      {cancelAction}
                      {confirmAction}
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </AppConfirmContext.Provider>
  );
}

export function useAppConfirm() {
  const context = useContext(AppConfirmContext);
  if (!context) {
    throw new Error("useAppConfirm must be used within AppConfirmProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9, 7, 4, 0.52)",
    paddingHorizontal: 20,
  },
  dialogWrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  dialog: {
    width: "100%",
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    maxHeight: "100%",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  copyCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  message: {
    marginTop: 6,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: 18,
    width: "100%",
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
  },
  actionsColumn: {
    flexDirection: "column",
  },
  actionInline: {
    flex: 1,
  },
  actionStacked: {
    width: "100%",
  },
  button: {
    minHeight: 50,
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: {
    borderWidth: 1,
  },
  buttonPrimary: {
    borderWidth: 0,
  },
  buttonLabel: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.88,
  },
});
