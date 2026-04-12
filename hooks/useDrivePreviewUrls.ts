import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

type PreviewableAttachment = {
  type?: "image" | "document";
  driveFileId?: string;
  driveThumbnailLink?: string;
};

const PREVIEW_TTL_MS = 10 * 60 * 1000;
const previewCache = new Map<string, { url: string; fetchedAt: number }>();

function arePreviewMapsEqual(
  left: Record<string, string>,
  right: Record<string, string>
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

export function useDrivePreviewUrls(
  attachments: PreviewableAttachment[],
  token?: string | null
) {
  const getDrivePreviewUrls = useAction(api.integrations.getDrivePreviewUrls);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const imageFileIds = useMemo(
    () =>
      [...new Set(
        attachments
          .filter((attachment) => attachment.type === "image" && !!attachment.driveFileId)
          .map((attachment) => attachment.driveFileId!)
      )],
    [attachments]
  );
  const imageFileIdsKey = imageFileIds.join("|");

  useEffect(() => {
    const now = Date.now();
    const cached: Record<string, string> = {};
    const missing: string[] = [];

    for (const fileId of imageFileIds) {
      const existing = previewCache.get(fileId);
      if (existing && now - existing.fetchedAt < PREVIEW_TTL_MS) {
        cached[fileId] = existing.url;
      } else {
        missing.push(fileId);
      }
    }

    setPreviewUrls((current) =>
      arePreviewMapsEqual(current, cached) ? current : cached
    );

    if (!token || missing.length === 0) {
      return;
    }

    let cancelled = false;
    getDrivePreviewUrls({ token, fileIds: missing })
      .then((freshUrls) => {
        if (cancelled) return;

        const fetchedAt = Date.now();
        for (const [fileId, url] of Object.entries(freshUrls)) {
          previewCache.set(fileId, { url, fetchedAt });
        }

        setPreviewUrls((current) => {
          const next = { ...current, ...freshUrls };
          return arePreviewMapsEqual(current, next) ? current : next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [getDrivePreviewUrls, imageFileIdsKey, token]);

  return previewUrls;
}
