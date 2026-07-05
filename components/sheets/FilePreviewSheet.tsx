import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  TouchableOpacity as BottomSheetTouchableOpacity,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";
import { useColors } from "@/hooks/useColors";
import { useDrivePreviewUrls } from "@/hooks/useDrivePreviewUrls";
import { useAuth } from "@/hooks/useAuth";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { appShadow } from "@/components/ui/themeHelpers";
import { selectSheetOpen, selectSheetPayload, useUIStore } from "@/store/ui";
import { useSemanticColors } from "@/hooks/useSemanticColors";

export function FilePreviewSheet() {
  const colors = useColors();
  const semantic = useSemanticColors();
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();
  const modalRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const { token } = useAuth();
  const { confirm } = useAppConfirm();
  const { showToast } = useAppToast();
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);
  const open = useUIStore(selectSheetOpen("filePreview"));
  const payload = useUIStore(selectSheetPayload("filePreview"));
  const closeFilePreview = useUIStore((state) => state.closeFilePreview);
  const snapPoints = useMemo(() => (isLargeScreen ? ["70%"] : ["85%"]), [isLargeScreen]);

  const attachment = payload?.attachment ?? null;
  const previewUrls = useDrivePreviewUrls(attachment ? [attachment] : [], token);
  const previewUri = attachment
    ? (previewUrls[attachment.driveFileId] ?? attachment.driveThumbnailLink)
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

  const isOpen = open && !!attachment;
  const processingColors = React.useMemo(
    () => ({
      pending: semantic.documentStatus.pending,
      processing: semantic.documentStatus.processing,
      completed: semantic.documentStatus.completed,
      failed: semantic.documentStatus.failed,
    }),
    [
      semantic.documentStatus.completed,
      semantic.documentStatus.failed,
      semantic.documentStatus.pending,
      semantic.documentStatus.processing,
    ],
  );

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    closeFilePreview();
  }, [closeFilePreview]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  useEffect(() => {
    if (isOpen && !presentedRef.current) {
      modalRef.current?.present();
      presentedRef.current = true;
      return;
    }

    if (!isOpen && presentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [isOpen]);

  return (
    <BottomSheetModal
      ref={modalRef}
      name="filePreview"
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      detached={isLargeScreen}
      style={
        isLargeScreen
          ? {
              marginHorizontal: 16,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }
          : undefined
      }
      topInset={isLargeScreen ? insets.top + 16 : insets.top}
      bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize"
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      onDismiss={handleDismiss}
    >
      {attachment ? (
        <>
          <BottomSheetScrollView
            contentContainerStyle={[styles.previewScrollContent, { paddingTop: 10 }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <XStack alignItems="center" justifyContent="space-between" gap={12}>
              <YStack flex={1} minWidth={0} gap={2}>
                <Text fontSize={18} fontWeight="700" color={colors.text}>
                  File Preview
                </Text>
                <Text fontSize={13} lineHeight={18} color={colors.textSecondary}>
                  {attachment.type === "image" ? "Image" : "Document"}
                </Text>
              </YStack>
              <BottomSheetTouchableOpacity onPress={closeFilePreview} hitSlop={8}>
                <XStack width={36} height={36} alignItems="center" justifyContent="center">
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </XStack>
              </BottomSheetTouchableOpacity>
            </XStack>

            {attachment.type === "image" ? (
              <YStack
                style={[
                  styles.previewHero,
                  { backgroundColor: colors.backgroundSecondary },
                  appShadow(colors.shadow, "xs"),
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
                  { backgroundColor: colors.backgroundSecondary },
                  appShadow(colors.shadow, "xs"),
                ]}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="file-text" size={42} color={colors.primary} />
              </XStack>
            )}

            <YStack
              gap="$3"
              padding={16}
              borderRadius={16}
              backgroundColor={colors.surface}
              style={appShadow(colors.shadow, "xs")}
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
                    {
                      backgroundColor: processingColors[attachment.processingStatus],
                    },
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

            <YStack gap={10}>
              <BottomSheetTouchableOpacity
                onPress={handleOpenDrive}
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.backgroundSecondary },
                  appShadow(colors.shadow, "hairline"),
                ]}
              >
                <Feather name="external-link" size={16} color={colors.text} />
                <Text fontSize={14} fontWeight="600" color={colors.text}>
                  Open in Google Drive
                </Text>
              </BottomSheetTouchableOpacity>

              <BottomSheetTouchableOpacity
                onPress={handleDelete}
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.surfaceDangerSoft },
                  appShadow(colors.textError, "hairline"),
                ]}
              >
                <Feather name="trash-2" size={16} color={colors.textError} />
                <Text fontSize={14} fontWeight="600" color={colors.textError}>
                  Delete File
                </Text>
              </BottomSheetTouchableOpacity>
            </YStack>
          </BottomSheetScrollView>
        </>
      ) : null}
    </BottomSheetModal>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  previewHero: {
    minHeight: 280,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
  },
  previewHeroImage: {
    width: "100%",
    height: 320,
  },
  documentHero: {
    minHeight: 180,
    borderRadius: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
  },
});
