import { create } from "zustand";
import type { MemoryNote } from "@/types/memory";

export type SheetId =
  | "unifiedCommand"
  | "editMemory"
  | "homeOverview"
  | "filePreview"
  | "turnBreakdown";

export type FilePreviewPayload = {
  _id: string;
  filename: string;
  type: "image" | "document";
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
  driveWebViewLink?: string;
  driveThumbnailLink?: string;
  extractedContent?: string;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
};

export type SheetPayloadMap = {
  unifiedCommand: null;
  editMemory: { memory: MemoryNote };
  homeOverview: null;
  filePreview: { attachment: FilePreviewPayload };
  turnBreakdown: null;
};

type SheetEntry<K extends SheetId = SheetId> = {
  open: boolean;
  payload: SheetPayloadMap[K] | null;
  enteredAt: number | null;
};

type SheetState = {
  [K in SheetId]: SheetEntry<K>;
};

interface UIStore {
  sheets: SheetState;
  sheetStack: SheetId[];

  openSheet: <K extends SheetId>(id: K, payload?: SheetPayloadMap[K]) => void;
  closeSheet: (id: SheetId) => void;
  replaceTopSheet: <K extends SheetId>(id: K, payload?: SheetPayloadMap[K]) => void;
  closeAllSheets: () => void;

  openAIChat: () => void;
  closeAIChat: () => void;
  openEditMemory: (memory: MemoryNote) => void;
  closeEditMemory: () => void;
  openCommand: () => void;
  closeCommand: () => void;
  openHomeOverview: () => void;
  closeHomeOverview: () => void;
  openFilePreview: (attachment: FilePreviewPayload) => void;
  closeFilePreview: () => void;
  openTurnBreakdown: () => void;
  closeTurnBreakdown: () => void;
  resetSheets: () => void;
}

const EMPTY_SHEETS: SheetState = {
  unifiedCommand: { open: false, payload: null, enteredAt: null },
  editMemory: { open: false, payload: null, enteredAt: null },
  homeOverview: { open: false, payload: null, enteredAt: null },
  filePreview: { open: false, payload: null, enteredAt: null },
  turnBreakdown: { open: false, payload: null, enteredAt: null },
};

function registerSheetId(stack: SheetId[], id: SheetId) {
  const next = stack.filter((sheetId) => sheetId !== id);
  next.push(id);
  return next;
}

function unregisterSheetId(stack: SheetId[], id: SheetId) {
  return stack.filter((sheetId) => sheetId !== id);
}

function resetSheetEntry<K extends SheetId>(id: K): SheetEntry<K> {
  return {
    open: false,
    payload: null,
    enteredAt: null,
  };
}

export const useUIStore = create<UIStore>()((set) => ({
  sheets: EMPTY_SHEETS,
  sheetStack: [],

  openSheet: (id, payload) =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        [id]: {
          open: true,
          payload: (payload ?? null) as SheetPayloadMap[typeof id] | null,
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, id),
    })),

  closeSheet: (id) =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        [id]: resetSheetEntry(id),
      },
      sheetStack: unregisterSheetId(state.sheetStack, id),
    })),

  replaceTopSheet: (id, payload) =>
    set((state) => {
      const currentTop = state.sheetStack[state.sheetStack.length - 1];
      const nextStack = currentTop
        ? registerSheetId(unregisterSheetId(state.sheetStack, currentTop), id)
        : registerSheetId(state.sheetStack, id);

      return {
        sheets: {
          ...state.sheets,
          ...(currentTop ? { [currentTop]: resetSheetEntry(currentTop) } : {}),
          [id]: {
            open: true,
            payload: (payload ?? null) as SheetPayloadMap[typeof id] | null,
            enteredAt: Date.now(),
          },
        },
        sheetStack: nextStack,
      };
    }),

  closeAllSheets: () =>
    set({
      sheets: EMPTY_SHEETS,
      sheetStack: [],
    }),

  openAIChat: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        unifiedCommand: {
          open: true,
          payload: null,
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "unifiedCommand"),
    })),
  closeAIChat: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        unifiedCommand: resetSheetEntry("unifiedCommand"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "unifiedCommand"),
    })),

  openEditMemory: (memory) =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        editMemory: {
          open: true,
          payload: { memory },
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "editMemory"),
    })),
  closeEditMemory: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        editMemory: resetSheetEntry("editMemory"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "editMemory"),
    })),

  openCommand: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        unifiedCommand: {
          open: true,
          payload: null,
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "unifiedCommand"),
    })),
  closeCommand: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        unifiedCommand: resetSheetEntry("unifiedCommand"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "unifiedCommand"),
    })),

  openHomeOverview: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        homeOverview: {
          open: true,
          payload: null,
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "homeOverview"),
    })),
  closeHomeOverview: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        homeOverview: resetSheetEntry("homeOverview"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "homeOverview"),
    })),

  openFilePreview: (attachment) =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        filePreview: {
          open: true,
          payload: { attachment },
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "filePreview"),
    })),
  closeFilePreview: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        filePreview: resetSheetEntry("filePreview"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "filePreview"),
    })),

  openTurnBreakdown: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        turnBreakdown: {
          open: true,
          payload: null,
          enteredAt: Date.now(),
        },
      },
      sheetStack: registerSheetId(state.sheetStack, "turnBreakdown"),
    })),
  closeTurnBreakdown: () =>
    set((state) => ({
      sheets: {
        ...state.sheets,
        turnBreakdown: resetSheetEntry("turnBreakdown"),
      },
      sheetStack: unregisterSheetId(state.sheetStack, "turnBreakdown"),
    })),

  resetSheets: () =>
    set({
      sheets: EMPTY_SHEETS,
      sheetStack: [],
    }),
}));

export const selectSheetStack = (state: UIStore) => state.sheetStack;
export const selectIsAIChatOpen = (state: UIStore) => state.sheets.unifiedCommand.open;
export const selectIsEditMemoryOpen = (state: UIStore) => state.sheets.editMemory.open;
export const selectIsCommandOpen = (state: UIStore) => state.sheets.unifiedCommand.open;
export const selectSheetOpen = (id: SheetId) => (state: UIStore) => state.sheets[id].open;
export const selectSheetPayload =
  <K extends SheetId>(id: K) =>
  (state: UIStore) =>
    state.sheets[id].payload as SheetPayloadMap[K] | null;
export const selectSheetPosition = (sheetId: SheetId) => (state: UIStore) => {
  const index = state.sheetStack.indexOf(sheetId);
  if (index === -1) return { depth: 0, total: state.sheetStack.length };
  const depth = state.sheetStack.length - 1 - index;
  return { depth, total: state.sheetStack.length };
};
