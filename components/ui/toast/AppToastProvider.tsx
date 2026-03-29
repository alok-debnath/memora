import { Feather } from "@expo/vector-icons";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { createPortal } from "react-dom";
import Animated, {
  LinearTransition,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme, View, XStack, YStack } from "tamagui";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppToastTone = "default" | "info" | "success" | "warning" | "error";
export type AppToastCloseMode = "auto" | "manual";

export interface AppToastAction {
  id?: string;
  label: string;
  onPress?: () => void | Promise<void>;
  closeOnPress?: boolean;
}

export interface AppToastOptions {
  title: string;
  message?: string;
  tone?: AppToastTone;
  duration?: number;
  closeMode?: AppToastCloseMode;
  showCloseButton?: boolean;
  actions?: AppToastAction[];
  onClose?: () => void;
}

interface AppToastItem {
  id: string;
  title: string;
  message?: string;
  tone: AppToastTone;
  duration: number;
  closeMode: AppToastCloseMode;
  showCloseButton: boolean;
  actions: AppToastAction[];
  onClose?: () => void;
}

interface AppToastContextValue {
  showToast: (options: AppToastOptions) => string;
  hideToast: (id?: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 4000;
const MANUAL_CLOSE_DURATION = 24 * 60 * 60 * 1000;
const MAX_TOASTS = 2;
const SWIPE_DISMISS_THRESHOLD = 50;

const TONE_COLORS: Record<AppToastTone, string> = {
  default: "#7C3AED",
  info:    "#0EA5E9",
  success: "#10B981",
  warning: "#F59E0B",
  error:   "#EF4444",
};

export const AppToastContext = createContext<AppToastContextValue | null>(null);

// ─── Module-level shared state (Provider & Renderer stay in sync) ─────────────

type ToastListener = (toasts: AppToastItem[]) => void;

let currentToasts: AppToastItem[] = [];
const listeners = new Set<ToastListener>();

function getToasts() {
  return currentToasts;
}

function setToasts(
  updater: AppToastItem[] | ((prev: AppToastItem[]) => AppToastItem[]),
) {
  currentToasts =
    typeof updater === "function" ? updater(currentToasts) : updater;
  listeners.forEach((l) => l(currentToasts));
}

function subscribe(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function resolveToastDuration(options?: Pick<AppToastOptions, "duration" | "closeMode">) {
  if (options?.closeMode === "manual") return MANUAL_CLOSE_DURATION;
  return options?.duration ?? DEFAULT_DURATION;
}

// ─── Imperative API — usable outside React ────────────────────────────────────

let imperativeCounter = 0;

export function showToastImperative(options: AppToastOptions): string {
  const id = `toast-imp-${Date.now()}-${imperativeCounter++}`;
  const closeMode = options.closeMode ?? "auto";

  const item: AppToastItem = {
    id,
    title: options.title,
    message: options.message,
    tone: options.tone ?? "default",
    duration: resolveToastDuration({ duration: options.duration, closeMode }),
    closeMode,
    showCloseButton: closeMode === "manual" || !!options.showCloseButton,
    actions: options.actions?.slice(0, 2) ?? [],
    onClose: options.onClose,
  };

  setToasts((prev) => {
    const next = [item, ...prev];
    if (next.length > MAX_TOASTS) {
      next.slice(MAX_TOASTS).forEach((t) => t.onClose?.());
      return next.slice(0, MAX_TOASTS);
    }
    return next;
  });

  if (closeMode !== "manual") {
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, item.duration);
  }

  return id;
}

export function hideToastImperative(id: string): void {
  setToasts((prev) => {
    prev.find((t) => t.id === id)?.onClose?.();
    return prev.filter((t) => t.id !== id);
  });
}

// ─── Individual animated toast ────────────────────────────────────────────────

const ENTER = SlideInUp.springify().damping(20).mass(0.9).stiffness(200);
const EXIT  = SlideOutUp.springify().damping(22).mass(0.8).stiffness(240);

function AnimatedToast({
  toast,
  onDismiss,
  maxWidth,
}: {
  toast: AppToastItem;
  onDismiss: (id: string) => void;
  maxWidth: number;
}) {
  const theme = useTheme();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useSharedValue(0);
  const isDismissing = useRef(false);

  useEffect(() => {
    if (toast.closeMode === "manual") return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.duration, toast.closeMode, onDismiss]);

  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 5 && g.dy < 0,
        onPanResponderMove: (_, g) => {
          translateY.value = Math.min(0, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dy) > SWIPE_DISMISS_THRESHOLD) {
            translateY.value = withTiming(-120, { duration: 150 });
            dismiss();
          } else {
            translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
          }
        },
        onPanResponderTerminate: () => {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        },
      }),
    [translateY, dismiss],
  );

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const toneColor = TONE_COLORS[toast.tone];

  return (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      layout={LinearTransition.duration(250)}
    >
      <Animated.View
        style={[
          styles.toast,
          swipeStyle,
          {
            maxWidth,
            backgroundColor: theme.backgroundStrong?.val,
            borderColor: theme.borderColor?.val,
            shadowColor: "#000",
          },
        ]}
        {...panResponder.panHandlers}
      >
        <XStack gap={10} alignItems="flex-start" width="100%">
          {/* Tone accent bar */}
          <View
            width={4}
            alignSelf="stretch"
            borderRadius={4}
            backgroundColor={toneColor}
          />

          {/* Content */}
          <YStack flex={1} minWidth={0} gap={2}>
            <Text
              fontSize={13}
              fontWeight="600"
              fontFamily="$body"
              color="$color"
              numberOfLines={2}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text
                fontSize={12}
                fontFamily="$body"
                color="$colorMuted"
                numberOfLines={3}
              >
                {toast.message}
              </Text>
            ) : null}

            {/* Action buttons */}
            {toast.actions.length > 0 ? (
              <XStack gap={6} marginTop={6}>
                {toast.actions.map((action, i) => (
                  <Pressable
                    key={action.id ?? `${toast.id}-action-${i}`}
                    onPress={() => {
                      action.onPress?.();
                      if (action.closeOnPress ?? true) dismiss();
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: toneColor,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      fontSize={12}
                      fontWeight="600"
                      fontFamily="$body"
                      color={toneColor as any}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </XStack>
            ) : null}
          </YStack>

          {/* Close button */}
          {toast.showCloseButton ? (
            <Pressable onPress={dismiss} hitSlop={12}>
              <View
                width={26}
                height={26}
                borderRadius={13}
                borderWidth={1}
                borderColor="$borderColor"
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="x" size={14} color={theme.colorMuted?.val} />
              </View>
            </Pressable>
          ) : null}
        </XStack>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let idCounter = 0;

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => {
      prev.find((t) => t.id === id)?.onClose?.();
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const showToast = useCallback((options: AppToastOptions): string => {
    const id = `toast-${Date.now()}-${idCounter++}`;
    const closeMode = options.closeMode ?? "auto";

    const item: AppToastItem = {
      id,
      title: options.title,
      message: options.message,
      tone: options.tone ?? "default",
      duration: resolveToastDuration({ duration: options.duration, closeMode }),
      closeMode,
      showCloseButton: closeMode === "manual" || !!options.showCloseButton,
      actions: options.actions?.slice(0, 2) ?? [],
      onClose: options.onClose,
    };

    setToasts((prev) => {
      const next = [item, ...prev];
      if (next.length > MAX_TOASTS) {
        next.slice(MAX_TOASTS).forEach((t) => t.onClose?.());
        return next.slice(0, MAX_TOASTS);
      }
      return next;
    });

    return id;
  }, []);

  const hideToast = useCallback(
    (id?: string) => {
      const target = id ?? getToasts()[0]?.id;
      if (target) dismissToast(target);
    },
    [dismissToast],
  );

  const value = useMemo<AppToastContextValue>(
    () => ({ showToast, hideToast }),
    [showToast, hideToast],
  );

  return (
    <AppToastContext.Provider value={value}>{children}</AppToastContext.Provider>
  );
}

// ─── Renderer — place AFTER all providers in root layout ─────────────────────

export function AppToastRenderer() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [toasts, setLocalToasts] = useState<AppToastItem[]>(getToasts);

  useEffect(() => subscribe(setLocalToasts), []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => {
      prev.find((t) => t.id === id)?.onClose?.();
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const maxWidth = Math.min(620, Math.max(width - 24, 0));

  if (toasts.length === 0) return null;

  const content = (
    <Animated.View
      pointerEvents="box-none"
      style={[
        Platform.OS === "web" ? styles.viewportWeb : styles.viewportNative,
        { top: insets.top + 10 },
      ]}
    >
      {toasts.map((toast) => (
        <AnimatedToast
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          maxWidth={maxWidth}
        />
      ))}
    </Animated.View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const viewportBase = {
  left: 12,
  right: 12,
  alignItems: "center" as const,
  gap: 8,
};

const styles = StyleSheet.create({
  viewportNative: {
    ...viewportBase,
    position: "absolute",
    zIndex: 200000,
  },
  viewportWeb: {
    ...viewportBase,
    // @ts-ignore
    position: "fixed",
    zIndex: 999999,
  },
  toast: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
});
