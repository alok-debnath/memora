import React, { Suspense, lazy, useCallback, useEffect } from "react";
import { BackHandler } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useAppToast } from "@/components/ui/toast";
import { selectSheetOpen, selectSheetPayload, selectSheetStack, useUIStore } from "@/store/ui";

const ChatSheet = lazy(() =>
  import("@/components/chat-sheet/ChatSheet").then((module) => ({ default: module.ChatSheet })),
);
const EditMemorySheet = lazy(() =>
  import("@/components/EditMemorySheet").then((module) => ({ default: module.EditMemorySheet })),
);
const FilePreviewSheet = lazy(() =>
  import("@/components/sheets/FilePreviewSheet").then((module) => ({
    default: module.FilePreviewSheet,
  })),
);
const HomeOverviewSheet = lazy(() =>
  import("@/components/sheets/HomeOverviewSheet").then((module) => ({
    default: module.HomeOverviewSheet,
  })),
);
const TurnBreakdownSheet = lazy(() =>
  import("@/components/sheets/TurnBreakdownSheet").then((module) => ({
    default: module.TurnBreakdownSheet,
  })),
);

export function DeferredProtectedSheetHost() {
  const hasOpenSheet = useUIStore((state) => selectSheetStack(state).length > 0);
  const [shouldMountHost, setShouldMountHost] = React.useState(false);

  React.useEffect(() => {
    if (hasOpenSheet) {
      setShouldMountHost(true);
    }
  }, [hasOpenSheet]);

  if (!shouldMountHost) return null;

  return (
    <Suspense fallback={null}>
      <ProtectedSheetHost />
    </Suspense>
  );
}

export function ProtectedSheetHost() {
  const { token } = useAuth();
  const { showToast } = useAppToast();
  const updateMemory = useMutation(api.memories.update);
  const deleteMemory = useMutation(api.memories.remove);

  const isCommandOpen = useUIStore(selectSheetOpen("unifiedCommand"));
  const editMemoryOpen = useUIStore(selectSheetOpen("editMemory"));
  const editMemoryPayload = useUIStore(selectSheetPayload("editMemory"));
  const closeCommand = useUIStore((state) => state.closeCommand);
  const closeEditMemory = useUIStore((state) => state.closeEditMemory);
  const closeSheet = useUIStore((state) => state.closeSheet);

  useEffect(() => {
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      const stack = useUIStore.getState().sheetStack;
      const top = stack[stack.length - 1];
      if (!top) return false;
      closeSheet(top);
      return true;
    });
    return () => backSub.remove();
  }, [closeSheet]);

  const handleSaveEdit = useCallback(
    async (data: Record<string, unknown>) => {
      const memory = editMemoryPayload?.memory;
      if (!memory?.id || !token) return;

      try {
        if (data._delete) {
          await deleteMemory({ token, id: memory.id as any });
          showToast({ title: "Memory deleted", tone: "success" });
        } else {
          await updateMemory({ token, id: memory.id as any, ...data });
          showToast({ title: "Memory updated", tone: "success" });
        }
        closeEditMemory();
      } catch {
        showToast({ title: "Couldn't save — try again", tone: "error" });
      }
    },
    [closeEditMemory, deleteMemory, editMemoryPayload?.memory, showToast, token, updateMemory],
  );

  return (
    <>
      <ChatSheet visible={isCommandOpen} onClose={closeCommand} />
      {editMemoryPayload?.memory ? (
        <EditMemorySheet
          key={editMemoryPayload.memory.id}
          memory={editMemoryPayload.memory}
          visible={editMemoryOpen}
          onClose={closeEditMemory}
          onSave={handleSaveEdit}
        />
      ) : null}
      <HomeOverviewSheet />
      <FilePreviewSheet />
      <TurnBreakdownSheet />
    </>
  );
}
