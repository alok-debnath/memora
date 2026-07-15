import React, { useMemo } from "react";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import type { ViewProps } from "react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppTheme } from "@/hooks/useAppTheme";
import type { ChatSheetController } from "./types";

function ChatEmptyState({ style, onLayout }: Pick<ViewProps, "style" | "onLayout">) {
  return (
    // VirtualizedList injects the correct platform-specific counter-transform
    // into its empty component. Forward it rather than hard-coding a rotation:
    // web/iOS use scaleY(-1), while Android uses scale(-1).
    <EmptyState
      icon="message-square"
      title="Ask Memora anything"
      description="Search, remember, attach, or speak."
      variant="plain"
      size="compact"
      onLayout={onLayout}
      style={style}
    />
  );
}

export function ChatMessageList({ controller }: { controller: ChatSheetController }) {
  const theme = useAppTheme();
  const { displayMessages, renderMessage, keyExtractor, flatListRef } = controller;

  // Inverted list: index 0 renders at the visual bottom, so the newest message
  // is always in view and new messages stay pinned without scroll gymnastics.
  const data = useMemo(() => [...displayMessages].reverse(), [displayMessages]);

  return (
    <BottomSheetFlatList
      ref={flatListRef}
      data={data}
      inverted
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      style={{ flex: 1, minHeight: 0, backgroundColor: theme.background.val }}
      ListEmptyComponent={<ChatEmptyState />}
      contentContainerStyle={{
        paddingHorizontal: 16,
        // Inverted: content start (paddingTop) is the visual bottom. Composer
        // now floats over the list instead of pushing it up, so this has to
        // clear the floating pill's own height + margins (~92) or the newest
        // message would render underneath it.
        paddingTop: 100,
        paddingBottom: 16,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}
