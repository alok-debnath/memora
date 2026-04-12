/**
 * Google Drive upload helper using expo-file-system for reliable binary reads on React Native.
 *
 * Strategy (3 steps):
 *  1. Create the file metadata record in Drive (POST /drive/v3/files) — sets name, mimeType, parents.
 *  2. Upload the file bytes via FileSystem.uploadAsync (BINARY_CONTENT) — avoids blob/fetch issues on Android.
 *  3. Fetch the final metadata (webViewLink, thumbnailLink) from Drive.
 */

import * as FileSystem from "expo-file-system/legacy";

export type DriveUploadResult = {
  fileId: string;
  webViewLink: string;
  thumbnailLink?: string;
};

export async function uploadFileToDrive(
  file: {
    uri: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  },
  accessToken: string,
  folderId: string,
): Promise<DriveUploadResult> {
  // ── Step 1: Create metadata record ─────────────────────────────────────────
  const metaRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.mimeType,
      parents: [folderId],
    }),
  });

  if (metaRes.status === 401) throw new Error("TOKEN_EXPIRED");
  if (!metaRes.ok) {
    let msg = `Metadata creation failed (${metaRes.status})`;
    try {
      const d = (await metaRes.json()) as { error?: { message?: string } };
      msg = d?.error?.message ?? msg;
    } catch {}
    console.error("[driveUpload] Step 1 failed:", msg);
    throw new Error(msg);
  }

  const meta = (await metaRes.json()) as { id: string };
  const fileId = meta.id;
  if (!fileId) throw new Error("Drive did not return a file ID");
  console.log("[driveUpload] Step 1 OK, fileId:", fileId);

  // ── Step 2: Upload content via FileSystem.uploadAsync ───────────────────────
  // FileSystem.uploadAsync reads the file natively — no JS blob/arrayBuffer needed.
  const uploadResult = await FileSystem.uploadAsync(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`,
    file.uri,
    {
      httpMethod: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": file.mimeType,
      },
    },
  );

  console.log(
    "[driveUpload] Step 2 status:",
    uploadResult.status,
    "body:",
    uploadResult.body?.slice(0, 200),
  );
  if (uploadResult.status === 401) throw new Error("TOKEN_EXPIRED");
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    let msg = `Upload failed (${uploadResult.status})`;
    try {
      const d = JSON.parse(uploadResult.body) as {
        error?: { message?: string };
      };
      msg = d?.error?.message ?? msg;
    } catch {}
    console.error("[driveUpload] Step 2 failed:", msg, "full body:", uploadResult.body);
    throw new Error(msg);
  }

  // ── Step 3: Fetch webViewLink + thumbnailLink ───────────────────────────────
  const infoRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,webViewLink,thumbnailLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const info = (await infoRes.json()) as {
    id: string;
    webViewLink?: string;
    thumbnailLink?: string;
  };

  return {
    fileId,
    webViewLink: info.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    thumbnailLink: info.thumbnailLink,
  };
}
