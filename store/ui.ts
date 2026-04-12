import { create } from "zustand";

interface UIStore {
  // AI Chat sheet
  isAIChatOpen: boolean;

  // Edit memory sheet
  isEditMemoryOpen: boolean;

  // Unified command panel
  isCommandOpen: boolean;

  // Sheet stack for stacking system
  sheetStack: string[];

  // Actions — centralized stack management for all sheets
  openAIChat: () => void;
  closeAIChat: () => void;
  openEditMemory: () => void;
  closeEditMemory: () => void;
  openCommand: () => void;
  closeCommand: () => void;

  pushSheet: (id: string) => void;
  popSheet: (id: string) => void;
  resetSheets: () => void;
}

function registerSheetId(stack: string[], id: string) {
  const next = stack.filter((sheetId) => sheetId !== id);
  next.push(id);
  return next;
}

function unregisterSheetId(stack: string[], id: string) {
  return stack.filter((sheetId) => sheetId !== id);
}

export const useUIStore = create<UIStore>()((set) => ({
  isAIChatOpen: false,
  isEditMemoryOpen: false,
  isCommandOpen: false,
  sheetStack: [],

  openAIChat: () =>
    set((state) => ({
      isAIChatOpen: true,
      sheetStack: registerSheetId(state.sheetStack, "aiChat"),
    })),
  closeAIChat: () =>
    set((state) => ({
      isAIChatOpen: false,
      sheetStack: unregisterSheetId(state.sheetStack, "aiChat"),
    })),

  openEditMemory: () =>
    set((state) => ({
      isEditMemoryOpen: true,
      sheetStack: registerSheetId(state.sheetStack, "editMemory"),
    })),
  closeEditMemory: () =>
    set((state) => ({
      isEditMemoryOpen: false,
      sheetStack: unregisterSheetId(state.sheetStack, "editMemory"),
    })),

  openCommand: () =>
    set((state) => ({
      isCommandOpen: true,
      sheetStack: registerSheetId(state.sheetStack, "unifiedCommand"),
    })),
  closeCommand: () =>
    set((state) => ({
      isCommandOpen: false,
      sheetStack: unregisterSheetId(state.sheetStack, "unifiedCommand"),
    })),

  pushSheet: (id) =>
    set((state) => ({
      sheetStack: registerSheetId(state.sheetStack, id),
    })),
  popSheet: (id) =>
    set((state) => ({
      sheetStack: unregisterSheetId(state.sheetStack, id),
    })),
  resetSheets: () =>
    set({
      isAIChatOpen: false,
      isEditMemoryOpen: false,
      isCommandOpen: false,
      sheetStack: [],
    }),
}));

// Selectors
export const selectSheetStack = (state: UIStore) => state.sheetStack;
export const selectIsAIChatOpen = (state: UIStore) => state.isAIChatOpen;
export const selectIsEditMemoryOpen = (state: UIStore) => state.isEditMemoryOpen;
export const selectIsCommandOpen = (state: UIStore) => state.isCommandOpen;
export const selectSheetPosition = (sheetId: string) => (state: UIStore) => {
  const index = state.sheetStack.indexOf(sheetId);
  if (index === -1) return { depth: 0, total: state.sheetStack.length };
  const depth = state.sheetStack.length - 1 - index;
  return { depth, total: state.sheetStack.length };
};
