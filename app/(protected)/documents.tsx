import React, { useState, useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Linking,
  View,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { XStack, YStack, Text, Sheet } from "tamagui";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { useColors } from "@/hooks/useColors";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";

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
  pending: "#F59E0B",
  processing: "#3B82F6",
  completed: "#10B981",
  failed: "#EF4444",
};

export default function FilesScreen() {
  const theme = useAppTheme();
  const colors = useColors();
  const auth = useAuth();
  const token = auth.token;
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();

  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedAttachment, setSelectedAttachment] = useState<AttachmentDoc | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [contentTopPadding, setContentTopPadding] = useState(86);

  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip"
  );

  const attachmentsResult = useQuery(
    api.attachments.listAttachmentsForUser,
    token
      ? {
          token,
          paginationOpts: { numItems: 60, cursor: null },
          type: filter === "all" ? undefined : filter,
        }
      : "skip"
  );

  const deleteAttachment = useMutation(api.attachments.deleteAttachment);

  const attachments = (attachmentsResult?.page ?? []) as AttachmentDoc[];
  const isLoading = attachmentsResult === undefined;

  const driveConnected = !!(googleIntegration?.connected && (googleIntegration as any).hasDriveScope);

  const handleDelete = useCallback(
    async (attachment: AttachmentDoc) => {
      if (!token) return;
      const confirmed = await confirm({
        title: "Delete File",
        message: `Remove "${attachment.filename}" from Memora and Google Drive?`,
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (!confirmed) return;
      try {
        await deleteAttachment({ token, attachmentId: attachment._id });
        setPreviewOpen(false);
        showToast({ title: "File deleted", tone: "success" });
      } catch {
        showToast({ title: "Could not delete file", tone: "error" });
      }
    },
    [confirm, token, deleteAttachment, showToast]
  );

  const handleOpenDrive = useCallback((link?: string) => {
    if (link) Linking.openURL(link);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: AttachmentDoc; index: number }) => (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(200)}>
        <Pressable
          onPress={() => {
            setSelectedAttachment(item);
            setPreviewOpen(true);
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
          {item.type === "image" && item.driveThumbnailLink ? (
            <Image
              source={{ uri: item.driveThumbnailLink }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={300}
              placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
            />
          ) : (
            <View style={[styles.docIconContainer, { backgroundColor: colors.backgroundSecondary }]}>
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
            <Text
              fontSize={11}
              fontWeight="600"
              color={colors.text}
              numberOfLines={1}
            >
              {item.filename}
            </Text>
            <XStack alignItems="center" gap={4}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: processingColors[item.processingStatus] },
                ]}
              />
              <Text fontSize={10} color={colors.textSecondary}>
                {formatDate(item.createdAt)}
              </Text>
            </XStack>
          </YStack>
        </Pressable>
      </Animated.View>
    ),
    [colors]
  );

  const listHeader = (
    <View>
      {!driveConnected && (
        <Pressable
          onPress={() => showToast({ title: "Connect Google in Settings to sync files", tone: "info" })}
          style={[styles.banner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
        >
          <Feather name="alert-circle" size={14} color={colors.primary} />
          <Text fontSize={12} color={colors.text} flex={1}>
            Connect Google Drive to store and sync files
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
                backgroundColor:
                  filter === f ? colors.primary : colors.backgroundSecondary,
                borderColor: filter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              fontSize={12}
              fontWeight="600"
              color={filter === f ? "#FFFFFF" : colors.textSecondary}
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
    <MorePageScaffold title="Files" noScroll onContentTopPadding={setContentTopPadding}>
      <FlatList
        data={attachments}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[styles.gridContent, { paddingTop: contentTopPadding }]}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} tintColor={colors.primary} />
        }
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

      {/* Preview sheet */}
      <Sheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        snapPoints={[70]}
        snapPointsMode="percent"
        dismissOnSnapToBottom
        modal
        zIndex={100000}
        animation="quick"
      >
        <Sheet.Overlay animation="quick" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
        <Sheet.Handle />
        <Sheet.Frame
          padding="$4"
          backgroundColor="$background"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
        >
          {selectedAttachment && (
            <PreviewContent
              attachment={selectedAttachment}
              onOpenDrive={() => handleOpenDrive(selectedAttachment.driveWebViewLink)}
              onDelete={() => handleDelete(selectedAttachment)}
              colors={colors}
            />
          )}
        </Sheet.Frame>
      </Sheet>
    </MorePageScaffold>
  );
}

function PreviewContent({
  attachment,
  onOpenDrive,
  onDelete,
  colors,
}: {
  attachment: AttachmentDoc;
  onOpenDrive: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <YStack gap="$4" flex={1}>
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        {attachment.type === "image" ? (
          <Image
            source={{ uri: attachment.driveThumbnailLink ?? "" }}
            style={styles.previewImage}
            contentFit="contain"
          />
        ) : (
          <XStack
            width={60}
            height={60}
            borderRadius={12}
            backgroundColor={colors.backgroundSecondary}
            alignItems="center"
            justifyContent="center"
          >
            <Feather name="file-text" size={28} color={colors.primary} />
          </XStack>
        )}
        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontWeight="700" color={colors.text} numberOfLines={2}>
            {attachment.filename}
          </Text>
          <Text fontSize={11} color={colors.textSecondary}>
            {formatFileSize(attachment.sizeBytes)} · {formatDate(attachment.createdAt)}
          </Text>
          <XStack alignItems="center" gap={4} mt={2}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: processingColors[attachment.processingStatus] },
              ]}
            />
            <Text fontSize={11} color={colors.textSecondary} textTransform="capitalize">
              {attachment.processingStatus}
            </Text>
          </XStack>
        </YStack>
      </XStack>

      {attachment.extractedContent && (
        <YStack gap={6}>
          <Text fontSize={12} fontWeight="600" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
            Extracted Content
          </Text>
          <Text fontSize={13} color={colors.text} numberOfLines={8} lineHeight={20}>
            {attachment.extractedContent}
          </Text>
        </YStack>
      )}

      <YStack gap="$2" mt="$2">
        <Pressable
          onPress={onOpenDrive}
          style={[styles.actionBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
        >
          <Feather name="external-link" size={16} color={colors.text} />
          <Text fontSize={14} fontWeight="600" color={colors.text}>
            Open in Google Drive
          </Text>
        </Pressable>

        <Pressable
          onPress={onDelete}
          style={[styles.actionBtn, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}
        >
          <Feather name="trash-2" size={16} color="#EF4444" />
          <Text fontSize={14} fontWeight="600" color="#EF4444">
            Delete File
          </Text>
        </Pressable>
      </YStack>
    </YStack>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
});
