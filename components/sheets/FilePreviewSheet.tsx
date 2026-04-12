import React, { useCallback } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { Text, XStack, YStack } from "tamagui";
import { BaseSheet } from "@/components/ui/BaseSheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { useColors } from "@/hooks/useColors";
import { useDrivePreviewUrls } from "@/hooks/useDrivePreviewUrls";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { statusAccentColors } from "@/constants/colors";
import { selectSheetOpen, selectSheetPayload, useUIStore } from "@/store/ui";

const processingColors = {
  pending: statusAccentColors.warning,
  processing: statusAccentColors.info,
  completed: statusAccentColors.success,
  failed: statusAccentColors.error,
};

export function FilePreviewSheet() {
  const colors = useColors();
  const { token } = useAuth();
  const { confirm } = useAppConfirm();
  const { showToast } = useAppToast();
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);
  const open = useUIStore(selectSheetOpen("filePreview"));
  const payload = useUIStore(selectSheetPayload("filePreview"));
  const closeFilePreview = useUIStore((state) => state.closeFilePreview);

  const attachment = payload?.attachment ?? null;
  const previewUrls = useDrivePreviewUrls(attachment ? [attachment] : [], token);
  const previewUri = attachment
    ? previewUrls[attachment.driveFileId] ?? attachment.driveThumbnailLink
    : undefined;

  const handleDelete = useCallback(async () => {
    if (!token || !attachment) return;
    const confirmed = await confirm({
      title: "Delete File",
      message: `Remove "${attachment.filename}" from Memora and Google Drive?`,
      confirmLabel: "Delete",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!confirmed) return;

    try {
      await deleteAttachment({ token, attachmentId: attachment._id as any });
      closeFilePreview();
      showToast({ title: "File deleted", tone: "success" });
    } catch {
      showToast({ title: "Could not delete file", tone: "error" });
    }
  }, [attachment, closeFilePreview, confirm, deleteAttachment, showToast, token]);

  const handleOpenDrive = useCallback(() => {
    if (attachment?.driveWebViewLink) {
      Linking.openURL(attachment.driveWebViewLink);
    }
  }, [attachment?.driveWebViewLink]);

  return (
    <BaseSheet
      open={open && !!attachment}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeFilePreview();
      }}
      sheetId="filePreview"
    >
      {attachment ? (
        <>
          <SheetHeader
            title="File Preview"
            subtitle={attachment.type === "image" ? "Image" : "Document"}
            right={
              <Pressable onPress={closeFilePreview} hitSlop={8}>
                <XStack
                  width={34}
                  height={34}
                  borderRadius={12}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={colors.backgroundSecondary}
                >
                  <Feather name="x" size={18} color={colors.text} />
                </XStack>
              </Pressable>
            }
          />
          <ScrollView
            contentContainerStyle={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {attachment.type === "image" ? (
              <YStack
                style={[
                  styles.previewHero,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                ]}
              >
                {previewUri ? (
                  <Image
                    source={{ uri: previewUri }}
                    style={styles.previewHeroImage}
                    contentFit="contain"
                    transition={200}
                  />
                ) : (
                  <YStack flex={1} alignItems="center" justifyContent="center" gap="$2">
                    <Feather name="image" size={32} color={colors.textSecondary} />
                    <Text fontSize={13} color={colors.textSecondary} textAlign="center">
                      Preview unavailable for this image
                    </Text>
                  </YStack>
                )}
              </YStack>
            ) : (
              <XStack
                style={[
                  styles.documentHero,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                ]}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="file-text" size={42} color={colors.primary} />
              </XStack>
            )}

            <YStack
              gap="$3"
              padding="$4"
              borderRadius="$5"
              borderWidth={1}
              backgroundColor={colors.surface}
              borderColor={colors.border}
            >
              <YStack gap="$1.5">
                <Text fontSize={18} fontWeight="700" color={colors.text}>
                  {attachment.filename}
                </Text>
                <Text fontSize={13} color={colors.textSecondary}>
                  {formatFileSize(attachment.sizeBytes)} · {formatDate(attachment.createdAt)}
                </Text>
              </YStack>

              <XStack alignItems="center" gap={6}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: processingColors[attachment.processingStatus] },
                  ]}
                />
                <Text fontSize={12} color={colors.textSecondary} textTransform="capitalize">
                  {attachment.processingStatus}
                </Text>
              </XStack>

              {attachment.extractedContent ? (
                <YStack gap={6}>
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={colors.textSecondary}
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Extracted Content
                  </Text>
                  <Text fontSize={13} color={colors.text} lineHeight={20}>
                    {attachment.extractedContent}
                  </Text>
                </YStack>
              ) : null}
            </YStack>

            <YStack gap="$2">
              <Pressable
                onPress={handleOpenDrive}
                style={[styles.actionBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              >
                <Feather name="external-link" size={16} color={colors.text} />
                <Text fontSize={14} fontWeight="600" color={colors.text}>
                  Open in Google Drive
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                style={[styles.actionBtn, { backgroundColor: colors.surfaceDangerSoft, borderColor: colors.textError }]}
              >
                <Feather name="trash-2" size={16} color={colors.textError} />
                <Text fontSize={14} fontWeight="600" color={colors.textError}>
                  Delete File
                </Text>
              </Pressable>
            </YStack>
          </ScrollView>
        </>
      ) : null}
    </BaseSheet>
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
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  previewScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  previewHero: {
    minHeight: 280,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "center",
  },
  previewHeroImage: {
    width: "100%",
    height: 320,
  },
  documentHero: {
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1,
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
