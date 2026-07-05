import React, { createContext, useContext } from "react";
import { Pressable } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import type { FeatherIconName } from "@/lib/icons";
import type { SheetId } from "@/store/ui";

// Lets a ContextMenu rendered inside a sheet's content identify which sheet
// it belongs to, so it can tell "a sheet is stacked above mine" (should
// disable) apart from "I *am* the topmost/only open sheet" (should not).
const SheetIdContext = createContext<SheetId | null>(null);
export const SheetIdProvider = SheetIdContext.Provider;
export function useContextMenuSheetId() {
  return useContext(SheetIdContext);
}

export interface ContextMenuHandle {
  open: () => void;
  close: () => void;
}

export interface ContextMenuItemDef {
  label: string;
  icon: FeatherIconName;
  iconColor?: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ContextMenuProps {
  children: React.ReactNode;
  preview?: React.ReactNode;
  items: (ContextMenuItemDef | null | undefined | false)[];
  onPress?: () => void;
  openOn?: "longPress" | "press";
  previewMinWidth?: number;
  previewFrame?: boolean;
}

export const IOS_SYMBOLS: Partial<Record<FeatherIconName, SFSymbol>> = {
  bell: "bell",
  "check-circle": "checkmark.circle",
  check: "checkmark",
  "edit-2": "square.and.pencil",
  "file-text": "doc.text",
  image: "photo",
  "link-2": "link",
  lock: "lock",
  "more-horizontal": "ellipsis",
  repeat: "repeat",
  "refresh-cw": "arrow.clockwise",
  search: "magnifyingglass",
  "share-2": "square.and.arrow.up",
  "trash-2": "trash",
  zap: "bolt.fill",
};

export function actionId(item: ContextMenuItemDef, index: number) {
  return `${index}:${item.label}`;
}

export function wrapTrigger(
  children: React.ReactNode,
  onPress: (() => void) | undefined,
  openOn: "longPress" | "press",
) {
  if (!onPress || openOn === "press") {
    return children;
  }

  return <Pressable onPress={onPress}>{children}</Pressable>;
}
