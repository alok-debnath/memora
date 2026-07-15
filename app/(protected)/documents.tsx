import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppImage } from "@/components/ui/AppImage";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { StatStrip } from "@/components/ui/StatStrip";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { radius, spacing } from "@/constants/uiTokens";
import { useAuth } from "@/hooks/useAuth";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useColors } from "@/hooks/useColors";
import { useDrivePreviewUrls } from "@/hooks/useDrivePreviewUrls";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { canUseGoogleDrive } from "@/lib/googleIntegration";
import { useUIStore } from "@/store/ui";
import { useQuery } from "convex/react";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { SelectionTabs } from "@/components/ui/SelectionTabs";

const GRID_PADDING = spacing.lg;
const GRID_GAP = spacing.md;

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
type ViewMode = "grid" | "list";

const FILTERS: Array<{ value: FilterType; label: string; icon: FeatherIconName }> = [
  { value: "all", label: "All files", icon: "archive" },
  { value: "image", label: "Images", icon: "image" },
  { value: "document", label: "Documents", icon: "file-text" },
];

export default function FilesScreen() {
  const colors = useColors();
  const semantic = useSemanticColors();
  const router = useAppRouter();
  const { token } = useAuth();
  const openFilePreview = useUIStore((state) => state.openFilePreview);
  const responsive = useResponsiveLayout();
  const [gridWidth, setGridWidth] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip",
  );
  const allAttachmentsResult = useQuery(
    api.attachments.listAttachmentsForUser,
    token
      ? {
          token,
          paginationOpts: { numItems: 60, cursor: null },
        }
      : "skip",
  );
  const filteredAttachmentsResult = useQuery(
    api.attachments.listAttachmentsForUser,
    token && filter !== "all"
      ? {
          token,
          paginationOpts: { numItems: 60, cursor: null },
          type: filter,
        }
      : "skip",
  );

  const allAttachments = (allAttachmentsResult?.page ?? []) as AttachmentDoc[];
  const attachments = (
    filter === "all" ? allAttachments : (filteredAttachmentsResult?.page ?? [])
  ) as AttachmentDoc[];
  const previewUrls = useDrivePreviewUrls(attachments, token);
  const isLoading =
    allAttachmentsResult === undefined ||
    (filter !== "all" && filteredAttachmentsResult === undefined);
  const driveConnected = canUseGoogleDrive(googleIntegration ?? null);

  const imageCount = allAttachments.filter((item) => item.type === "image").length;
  const documentCount = allAttachments.length - imageCount;
  const processingCount = allAttachments.filter(
    (item) => item.processingStatus === "pending" || item.processingStatus === "processing",
  ).length;
  const totalBytes = allAttachments.reduce((sum, item) => sum + item.sizeBytes, 0);

  const availableWidth = Math.max(
    0,
    Math.min(gridWidth || responsive.contentWidth, 1440) - GRID_PADDING * 2,
  );
  const availableColumnCount =
    viewMode === "list"
      ? 1
      : getFileColumnCount(availableWidth, responsive.isWide ? 5 : 4, GRID_GAP);
  const columnCount =
    viewMode === "list" ? 1 : Math.min(availableColumnCount, Math.max(1, attachments.length));
  const cardWidth = Math.max(
    viewMode === "list" ? availableWidth : 156,
    (availableWidth - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount,
  );

  const processingColors = useMemo(
    () => ({
      pending: semantic.documentStatus.pending,
      processing: semantic.documentStatus.processing,
      completed: semantic.documentStatus.completed,
      failed: semantic.documentStatus.failed,
    }),
    [semantic.documentStatus],
  );

  const renderItem = useCallback(
    ({ item }: { item: AttachmentDoc }) => {
      const previewUri =
        item.type === "image"
          ? (previewUrls[item.driveFileId] ?? item.driveThumbnailLink)
          : undefined;
      const statusColor = processingColors[item.processingStatus];
      const extension = getExtension(item.filename);

      if (viewMode === "list") {
        return (
          <PressableScale
            onPress={() => openFilePreview(item as never)}
            style={[
              styles.listCard,
              appShadow(colors.shadow, "xs"),
              { width: cardWidth, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <YStack
              width={82}
              height={82}
              overflow="hidden"
              alignItems="center"
              justifyContent="center"
              backgroundColor={withAlpha(colors.primary, "10")}
            >
              {previewUri ? (
                <AppImage
                  source={{ uri: previewUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  recyclingKey={String(item._id)}
                />
              ) : (
                <FileGlyph extension={extension} color={colors.primary} />
              )}
            </YStack>
            <YStack flex={1} minWidth={0} gap={5} paddingVertical={12}>
              <Text fontSize={14} fontWeight="700" color={colors.text} numberOfLines={1}>
                {item.filename}
              </Text>
              <Text fontSize={11} color={colors.textSecondary} numberOfLines={1}>
                {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
              </Text>
              <XStack alignItems="center" gap={5}>
                <YStack width={6} height={6} borderRadius={3} backgroundColor={statusColor} />
                <Text fontSize={10} color={colors.textSecondary} textTransform="capitalize">
                  {item.processingStatus}
                </Text>
              </XStack>
            </YStack>
            <Feather name="chevron-right" size={17} color={colors.textTertiary} />
          </PressableScale>
        );
      }

      return (
        <PressableScale
          onPress={() => openFilePreview(item as never)}
          style={[
            styles.gridCard,
            appShadow(colors.shadow, "xs"),
            { width: cardWidth, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <YStack
            height={Math.min(220, Math.max(140, cardWidth * 0.55))}
            overflow="hidden"
            alignItems="center"
            justifyContent="center"
            backgroundColor={
              item.type === "image" ? colors.backgroundSecondary : withAlpha(colors.primary, "0D")
            }
          >
            {previewUri ? (
              <AppImage
                source={{ uri: previewUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={220}
                recyclingKey={String(item._id)}
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              />
            ) : (
              <FileGlyph extension={extension} color={colors.primary} large />
            )}
            <YStack
              position="absolute"
              top={10}
              right={10}
              paddingHorizontal={8}
              paddingVertical={4}
              borderRadius={radius.pill}
              backgroundColor={withAlpha(colors.background, "DC")}
            >
              <Text fontSize={9} fontWeight="700" color={colors.textSecondary}>
                {extension}
              </Text>
            </YStack>
          </YStack>

          <YStack
            padding={spacing.md}
            gap={6}
            borderTopWidth={1}
            borderTopColor={colors.borderLight}
          >
            <Text fontSize={13} fontWeight="700" color={colors.text} numberOfLines={1}>
              {item.filename}
            </Text>
            <XStack alignItems="center" justifyContent="space-between" gap={8}>
              <Text fontSize={10} color={colors.textSecondary}>
                {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
              </Text>
              <YStack width={7} height={7} borderRadius={4} backgroundColor={statusColor} />
            </XStack>
          </YStack>
        </PressableScale>
      );
    },
    [cardWidth, colors, openFilePreview, previewUrls, processingColors, viewMode],
  );

  const listHeader = (
    <YStack gap={spacing.lg} paddingBottom={spacing.lg}>
      <SectionCard emphasis="quiet" density="compact">
        <XStack
          alignItems="flex-start"
          justifyContent="space-between"
          gap={spacing.xl}
          flexWrap="wrap"
          flexDirection={responsive.isExpanded ? "row" : "column"}
        >
          <YStack width={300} maxWidth="100%" gap={spacing.sm}>
            <XStack alignItems="center" gap={10}>
              <YStack
                width={42}
                height={42}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(colors.primary, "16")}
              >
                <Feather name="archive" size={19} color={colors.primary} />
              </YStack>
              <YStack gap={1}>
                <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={colors.text}>
                  Your file archive
                </Text>
                <Text fontSize={12} lineHeight={18} color={colors.textSecondary}>
                  Images and documents attached across memories and conversations.
                </Text>
              </YStack>
            </XStack>
          </YStack>
          <YStack
            minWidth={0}
            width={responsive.isExpanded ? (responsive.isWide ? 520 : 440) : "100%"}
            maxWidth="100%"
          >
            <StatStrip
              items={[
                { label: "Files", value: allAttachments.length },
                { label: "Images", value: imageCount },
                { label: "Documents", value: documentCount },
                {
                  label: processingCount > 0 ? "Processing" : "Stored",
                  value: processingCount > 0 ? processingCount : formatBytes(totalBytes),
                  color: processingCount > 0 ? semantic.documentStatus.processing : undefined,
                },
              ]}
            />
          </YStack>
        </XStack>
      </SectionCard>

      {!driveConnected ? (
        <PressableScale onPress={() => router.push("/(protected)/profile")}>
          <SurfaceCard variant="solid" padding={spacing.md} radius={radius.sm}>
            <XStack alignItems="center" gap={10}>
              <Feather name="cloud-off" size={16} color={colors.primary} />
              <YStack flex={1} gap={2}>
                <Text fontSize={12} fontWeight="700" color={colors.text}>
                  {googleIntegration?.connected
                    ? "Drive uploads are paused"
                    : "Drive is not connected"}
                </Text>
                <Text fontSize={11} lineHeight={16} color={colors.textSecondary}>
                  {googleIntegration?.connected
                    ? "Existing files remain available. Re-enable Drive in Profile to add more."
                    : "Connect Google in Profile to store and sync new attachments."}
                </Text>
              </YStack>
              <Feather name="arrow-up-right" size={15} color={colors.textTertiary} />
            </XStack>
          </SurfaceCard>
        </PressableScale>
      ) : null}

      <SurfaceCard variant="solid" padding={spacing.sm} radius={radius.md}>
        <XStack alignItems="center" justifyContent="space-between" gap={spacing.md} flexWrap="wrap">
          <FilterChipGroup
            options={FILTERS.map((option) => ({
              ...option,
              count:
                option.value === "all"
                  ? allAttachments.length
                  : option.value === "image"
                    ? imageCount
                    : documentCount,
            }))}
            value={filter}
            onChange={(next) => next && setFilter(next)}
            size="compact"
            accessibilityLabel="Filter files"
          />
          <SelectionTabs<ViewMode>
            options={[
              {
                value: "grid",
                label: "Grid view",
                compactLabel: "",
                icon: <Feather name="grid" size={15} color={colors.primary} />,
              },
              {
                value: "list",
                label: "List view",
                compactLabel: "",
                icon: <Feather name="list" size={15} color={colors.primary} />,
              },
            ]}
            value={viewMode}
            onChange={setViewMode}
            showCompactLabels
            size="compact"
            style={{ width: 96 }}
            accessibilityLabel="File layout"
          />
        </XStack>
      </SurfaceCard>

      <XStack alignItems="center" justifyContent="space-between" gap={12}>
        <Text fontSize={15} fontFamily="$heading" fontWeight="700" color={colors.text}>
          {filter === "all" ? "All files" : filter === "image" ? "Images" : "Documents"}
        </Text>
        <Text fontSize={11} color={colors.textSecondary}>
          {attachments.length} shown
        </Text>
      </XStack>
    </YStack>
  );

  return (
    <AppScreen
      showBack
      title="Files"
      subtitle="Browse the visual material and documents connected to your memory archive."
      contentWidth="workspace"
      noScroll
    >
      <FlatList
        key={`files-${viewMode}-${columnCount}`}
        onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        data={attachments}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        numColumns={columnCount}
        columnWrapperStyle={columnCount > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.gridContent}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} tintColor={colors.primary} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={filter === "all" ? "paperclip" : filter === "image" ? "image" : "file-text"}
              title={filter === "all" ? "No files yet" : `No ${filter}s found`}
              description={
                filter === "all"
                  ? "Attach an image or document in chat or a memory to start this archive."
                  : "Choose another file type or attach something new."
              }
            />
          ) : null
        }
      />
    </AppScreen>
  );
}

function FileGlyph({
  extension,
  color,
  large = false,
}: {
  extension: string;
  color: string;
  large?: boolean;
}) {
  return (
    <YStack alignItems="center" gap={large ? 8 : 4}>
      <Feather name="file-text" size={large ? 42 : 28} color={color} />
      <Text fontSize={large ? 11 : 9} fontWeight="800" letterSpacing={0.8} color={color}>
        {extension}
      </Text>
    </YStack>
  );
}

function getFileColumnCount(width: number, maximum: number, gap: number) {
  const minimum = width >= 1000 ? 190 : width >= 600 ? 176 : 156;
  return Math.max(1, Math.min(maximum, Math.floor((width + gap) / (minimum + gap))));
}

function getExtension(filename: string) {
  const extension = filename.split(".").pop()?.trim().toUpperCase();
  return extension && extension.length <= 5 ? extension : "FILE";
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

const styles = StyleSheet.create({
  gridContent: {
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: GRID_GAP,
  },
  gridCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  listCard: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingRight: spacing.md,
  },
});
