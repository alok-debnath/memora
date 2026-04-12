import React, { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useAppToast } from "@/components/ui/toast";
import { selectSheetOpen, selectSheetPayload, useUIStore } from "@/store/ui";
import { UnifiedCommandPanel } from "@/components/UnifiedCommandPanel";
import { EditMemorySheet } from "@/components/EditMemorySheet";
import { FilePreviewSheet } from "@/components/sheets/FilePreviewSheet";
import { HomeOverviewSheet } from "@/components/sheets/HomeOverviewSheet";

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
      <UnifiedCommandPanel visible={isCommandOpen} onClose={closeCommand} />
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
    </>
  );
}
