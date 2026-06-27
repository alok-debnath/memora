import React, { useState, useCallback } from "react";
import { FlatList, Pressable, StyleSheet, RefreshControl, View, Dimensions } from "react-native";
import { Image } from "expo-image";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { useColors } from "@/hooks/useColors";
import { useDrivePreviewUrls } from "@/hooks/useDrivePreviewUrls";
import { useAppToast } from "@/components/ui/toast";
import { statusAccentColors } from "@/constants/colors";
import { useUIStore } from "@/store/ui";
import { canUseGoogleDrive } from "@/lib/googleIntegration";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 16;
const GRID_GAP = 10;
const CARD_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type AttachmentDoc = {
  _id: Id<"memoryAttachments">;
  _creationTime: number;
  filename: string;
  type: "image" | "document";
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
  driveWebViewLink?: string;
  driveThumbnailLink?: string;
  extractedContent?: string;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  memoryId?: Id<"memories">;
  createdAt: number;
};

type FilterType = "all" | "image" | "document";

const processingColors = {
  pending: statusAccentColors.warning,
  processing: statusAccentColors.info,
  completed: statusAccentColors.success,
  failed: statusAccentColors.error,
};

export default function FilesScreen() {
  const colors = useColors();
  const auth = useAuth();
  const token = auth.token;
  const { showToast } = useAppToast();
  const openFilePreview = useUIStore((state) => state.openFilePreview);

  const [filter, setFilter] = useState<FilterType>("all");
  const [contentTopPadding, setContentTopPadding] = useState(86);

  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip",
  );

  const attachmentsResult = useQuery(
    api.attachments.listAttachmentsForUser,
    token
      ? {
          token,
          paginationOpts: { numItems: 60, cursor: null },
          type: filter === "all" ? undefined : filter,
        }
      : "skip",
  );

  const attachments = (attachmentsResult?.page ?? []) as AttachmentDoc[];
  const isLoading = attachmentsResult === undefined;
  const previewUrls = useDrivePreviewUrls(attachments, token);

  const driveConnected = canUseGoogleDrive(googleIntegration ?? null);

  const renderItem = useCallback(
    ({ item, index }: { item: AttachmentDoc; index: number }) => {
      const previewUri =
        item.type === "image"
          ? (previewUrls[item.driveFileId] ?? item.driveThumbnailLink)
          : undefined;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(200)}>
          <Pressable
            onPress={() => {
              openFilePreview(item as any);
            }}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {item.type === "image" && previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.thumbnail}
                contentFit="cover"
                transition={300}
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              />
            ) : (
              <View
                style={[styles.docIconContainer, { backgroundColor: colors.backgroundSecondary }]}
              >
                <Feather name="file-text" size={36} color={colors.primary} />
              </View>
            )}

            <YStack
              paddingHorizontal={8}
              paddingVertical={6}
              gap={2}
              borderTopWidth={StyleSheet.hairlineWidth}
              borderTopColor={colors.border}
            >
              <Text fontSize={11} fontWeight="600" color={colors.text} numberOfLines={1}>
                {item.filename}
              </Text>
              <XStack alignItems="center" gap={4}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: processingColors[item.processingStatus],
                    },
                  ]}
                />
                <Text fontSize={10} color={colors.textSecondary}>
                  {formatDate(item.createdAt)}
                </Text>
              </XStack>
            </YStack>
          </Pressable>
        </Animated.View>
      );
    },
    [colors, openFilePreview, previewUrls],
  );

  const listHeader = (
    <View>
      {!driveConnected && (
        <Pressable
          onPress={() =>
            showToast({
              title: googleIntegration?.connected
                ? "Google Drive uploads are turned off"
                : "Connect Google in Settings to sync files",
              tone: "info",
            })
          }
          style={[
            styles.banner,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="alert-circle" size={14} color={colors.primary} />
          <Text fontSize={12} color={colors.text} flex={1}>
            {googleIntegration?.connected
              ? googleIntegration.hasDriveScope
                ? "Turn Google Drive uploads back on in Profile to add new files"
                : "Reconnect Google in Profile to grant Drive upload access"
              : "Connect Google Drive to store and sync files"}
          </Text>
          <Feather name="external-link" size={14} color={colors.textSecondary} />
        </Pressable>
      )}
      <XStack paddingHorizontal={16} paddingBottom={12} gap={8}>
        {(["all", "image", "document"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f ? colors.primary : colors.backgroundSecondary,
                borderColor: filter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              fontSize={12}
              fontWeight="600"
              color={filter === f ? colors.destructiveForeground : colors.textSecondary}
              textTransform="capitalize"
            >
              {f === "all" ? "All" : f === "image" ? "Images" : "Documents"}
            </Text>
          </Pressable>
        ))}
      </XStack>
    </View>
  );

  return (
    <MorePageScaffold
      title="Files"
      noScroll
      staticHeader
      onContentTopPadding={setContentTopPadding}
    >
      <FlatList
        data={attachments}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[styles.gridContent, { paddingTop: contentTopPadding }]}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} tintColor={colors.primary} />}
        ListEmptyComponent={
          !isLoading ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={12} paddingTop={80}>
              <Feather name="paperclip" size={40} color={colors.textTertiary} />
              <Text fontSize={15} color={colors.textSecondary} textAlign="center">
                No files yet
              </Text>
              <Text fontSize={13} color={colors.textTertiary} textAlign="center" maxWidth={240}>
                Attach images or PDFs in chat or memories to see them here
              </Text>
            </YStack>
          ) : null
        }
      />
    </MorePageScaffold>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  columnWrapper: {
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  gridContent: {
    gap: GRID_GAP,
    paddingBottom: 40,
  },
  card: {
    width: CARD_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: CARD_SIZE,
  },
  docIconContainer: {
    width: "100%",
    height: CARD_SIZE * 0.75,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
