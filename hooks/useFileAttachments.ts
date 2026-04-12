import React, { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { uploadFileToDrive } from "@/lib/driveUpload";
import * as Crypto from "expo-crypto";

export type PendingAttachmentUploadStatus =
  | "idle"
  | "compressing"
  | "uploading"
  | "uploaded"
  | "error";

export type PendingAttachment = {
  /** Local UUID for this pending item */
  id: string;
  /** Compressed (images) or original (PDFs) local URI */
  uri: string;
  /** Original uncompressed URI */
  originalUri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  type: "image" | "document";
  uploadStatus: PendingAttachmentUploadStatus;
  /** Set after successful Drive upload */
  driveFileId?: string;
  driveWebViewLink?: string;
  driveThumbnailLink?: string;
  driveFolderId?: string;
  errorMessage?: string;
};

export type UploadedAttachment = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  type: "image" | "document";
  driveFileId: string;
  driveFolderId: string;
  driveWebViewLink?: string;
  driveThumbnailLink?: string;
};

type UseFileAttachmentsOptions = {
  token?: string;
};

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;

export function useFileAttachments({ token }: UseFileAttachmentsOptions = {}) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Keep a ref in sync so uploadAll can poll live state without stale closures
  const attachmentsRef = React.useRef(attachments);
  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const getDriveCredentials = useAction(api.integrations.getDriveUploadCredentials);

  const updateAttachment = useCallback((id: string, patch: Partial<PendingAttachment>) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const compressImage = useCallback(
    async (uri: string): Promise<{ uri: string; sizeBytes: number }> => {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_IMAGE_DIMENSION } }],
        {
          compress: IMAGE_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      let sizeBytes = 0;
      try {
        const response = await fetch(result.uri);
        const blob = await response.blob();
        sizeBytes = blob.size;
      } catch {}
      return { uri: result.uri, sizeBytes };
    },
    [],
  );

  const pickImages = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    const newAttachments: PendingAttachment[] = [];

    for (const asset of result.assets) {
      const localId = await Crypto.randomUUID();
      const name = asset.fileName ?? `image_${Date.now()}.jpg`;

      const pending: PendingAttachment = {
        id: localId,
        uri: asset.uri,
        originalUri: asset.uri,
        name,
        mimeType: asset.mimeType ?? "image/jpeg",
        sizeBytes: asset.fileSize ?? 0,
        type: "image",
        uploadStatus: "compressing",
      };
      newAttachments.push(pending);
    }

    setAttachments((prev) => [...prev, ...newAttachments]);

    for (const attachment of newAttachments) {
      compressImage(attachment.originalUri)
        .then(({ uri, sizeBytes }) => {
          updateAttachment(attachment.id, {
            uri,
            sizeBytes,
            uploadStatus: "idle",
          });
        })
        .catch(() => {
          updateAttachment(attachment.id, { uploadStatus: "idle" });
        });
    }
  }, [compressImage, updateAttachment]);

  const pickCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    const localId = await Crypto.randomUUID();
    const name = asset.fileName ?? `photo_${Date.now()}.jpg`;

    const pending: PendingAttachment = {
      id: localId,
      uri: asset.uri,
      originalUri: asset.uri,
      name,
      mimeType: asset.mimeType ?? "image/jpeg",
      sizeBytes: asset.fileSize ?? 0,
      type: "image",
      uploadStatus: "compressing",
    };

    setAttachments((prev) => [...prev, pending]);

    compressImage(asset.uri)
      .then(({ uri, sizeBytes }) => {
        updateAttachment(localId, { uri, sizeBytes, uploadStatus: "idle" });
      })
      .catch(() => {
        updateAttachment(localId, { uploadStatus: "idle" });
      });
  }, [compressImage, updateAttachment]);

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    const localId = await Crypto.randomUUID();

    setAttachments((prev) => [
      ...prev,
      {
        id: localId,
        uri: asset.uri,
        originalUri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/pdf",
        sizeBytes: asset.size ?? 0,
        type: "document" as const,
        uploadStatus: "idle" as const,
      },
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /**
   * Upload all pending attachments to Google Drive.
   * If any are still compressing, waits up to 15s for them to finish first.
   * Returns the list of successfully uploaded attachments.
   */
  const uploadAll = useCallback(async (): Promise<UploadedAttachment[]> => {
    const hasCompressing = attachmentsRef.current.some((a) => a.uploadStatus === "compressing");
    if (hasCompressing) {
      await new Promise<void>((resolve) => {
        const deadline = Date.now() + 15_000;
        const check = setInterval(() => {
          const stillCompressing = attachmentsRef.current.some(
            (a) => a.uploadStatus === "compressing",
          );
          if (!stillCompressing || Date.now() > deadline) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    const toUpload = attachmentsRef.current.filter((a) => a.uploadStatus === "idle");
    if (toUpload.length === 0) return [];

    let accessToken: string;
    let folderId: string;
    try {
      const creds = await getDriveCredentials({ token });
      accessToken = creds.accessToken;
      folderId = creds.folderId;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message === "DRIVE_DISABLED"
            ? "Google Drive uploads are turned off in Profile."
            : err.message
          : "Drive not connected";
      for (const a of toUpload) {
        updateAttachment(a.id, { uploadStatus: "error", errorMessage: msg });
      }
      throw err;
    }

    for (const a of toUpload) {
      updateAttachment(a.id, { uploadStatus: "uploading" });
    }

    const results = await Promise.allSettled(
      toUpload.map(async (attachment) => {
        const driveResult = await uploadFileToDrive(
          {
            uri: attachment.uri,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
          accessToken,
          folderId,
        );

        updateAttachment(attachment.id, {
          uploadStatus: "uploaded",
          driveFileId: driveResult.fileId,
          driveWebViewLink: driveResult.webViewLink,
          driveThumbnailLink: driveResult.thumbnailLink,
          driveFolderId: folderId,
        });

        return {
          localId: attachment.id,
          uploaded: {
            filename: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            type: attachment.type,
            driveFileId: driveResult.fileId,
            driveFolderId: folderId,
            driveWebViewLink: driveResult.webViewLink,
            driveThumbnailLink: driveResult.thumbnailLink,
          } satisfies UploadedAttachment,
        };
      }),
    );

    const uploaded: UploadedAttachment[] = [];
    let firstError: string | undefined;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        uploaded.push(result.value.uploaded);
      } else {
        const a = toUpload[i];
        const msg = result.reason instanceof Error ? result.reason.message : "Upload failed";
        console.error("[useFileAttachments] upload error for", a.name, ":", msg);
        if (!firstError) firstError = msg;
        updateAttachment(a.id, { uploadStatus: "error", errorMessage: msg });
      }
    }

    if (uploaded.length === 0 && firstError) {
      throw new Error(firstError);
    }

    return uploaded;
  }, [getDriveCredentials, token, updateAttachment]);

  const clear = useCallback(() => {
    setAttachments([]);
  }, []);

  const hasCompressing = attachments.some((a) => a.uploadStatus === "compressing");
  const hasUploading = attachments.some((a) => a.uploadStatus === "uploading");
  const hasPending = attachments.some(
    (a) => a.uploadStatus === "idle" || a.uploadStatus === "compressing",
  );

  return {
    attachments,
    pickImages,
    pickCamera,
    pickDocument,
    removeAttachment,
    uploadAll,
    clear,
    hasCompressing,
    hasUploading,
    hasPending,
  };
}
