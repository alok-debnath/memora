import * as Haptics from "expo-haptics";
import { useCallback, useContext } from "react";
import { AppToastContext, type AppToastOptions } from "./AppToastProvider";

function triggerHaptic(tone: AppToastOptions["tone"]) {
  switch (tone) {
    case "success":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      return;
    case "error":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    case "warning":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => undefined,
      );
      return;
    default:
      void Haptics.selectionAsync().catch(() => undefined);
  }
}

export function useAppToast() {
  const context = useContext(AppToastContext);

  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }

  const showToast = useCallback(
    (options: AppToastOptions) => {
      triggerHaptic(options.tone);
      return context.showToast(options);
    },
    [context],
  );

  const hideToast = useCallback((id?: string) => context.hideToast(id), [context]);

  return { showToast, hideToast };
}
