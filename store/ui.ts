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

  // Actions — eager stack management (push/pop inline, no useEffect)
  openAIChat: () => void;
  closeAIChat: () => void;
  openEditMemory: () => void;
  closeEditMemory: () => void;
  openCommand: () => void;
  closeCommand: () => void;

  // Generic stack helpers (for sheets not tracked above)
  pushSheet: (id: string) => void;
  popSheet: (id: string) => void;
  resetSheets: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  isAIChatOpen: false,
  isEditMemoryOpen: false,
  isCommandOpen: false,
  sheetStack: [],

  openAIChat: () =>
    set((state) => ({
      isAIChatOpen: true,
      sheetStack: state.sheetStack.includes("aiChat")
        ? state.sheetStack
        : [...state.sheetStack, "aiChat"],
    })),
  closeAIChat: () =>
    set((state) => ({
      isAIChatOpen: false,
      sheetStack: state.sheetStack.filter((s) => s !== "aiChat"),
    })),

  openEditMemory: () =>
    set((state) => ({
      isEditMemoryOpen: true,
      sheetStack: state.sheetStack.includes("editMemory")
        ? state.sheetStack
        : [...state.sheetStack, "editMemory"],
    })),
  closeEditMemory: () =>
    set((state) => ({
      isEditMemoryOpen: false,
      sheetStack: state.sheetStack.filter((s) => s !== "editMemory"),
    })),

  openCommand: () =>
    set((state) => ({
      isCommandOpen: true,
      sheetStack: state.sheetStack.includes("unifiedCommand")
        ? state.sheetStack
        : [...state.sheetStack, "unifiedCommand"],
    })),
  closeCommand: () =>
    set((state) => ({
      isCommandOpen: false,
      sheetStack: state.sheetStack.filter((s) => s !== "unifiedCommand"),
    })),

  pushSheet: (id) =>
    set((state) => ({
      sheetStack: state.sheetStack.includes(id)
        ? state.sheetStack
        : [...state.sheetStack, id],
    })),
  popSheet: (id) =>
    set((state) => ({
      sheetStack: state.sheetStack.filter((s) => s !== id),
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
