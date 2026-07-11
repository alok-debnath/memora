"use node";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  extractTextContent,
  resolveAiRoute,
  resolveAiFallbackRoute,
  trackedChatCompletionOnRoute,
} from "./aiDispatch";

export const ATTACHMENT_TEXT_LIMIT = 3000;

type AttachmentLike = {
  type: "image" | "document";
  filename: string;
  driveFileId: string;
  driveThumbnailLink?: string;
  driveWebViewLink?: string;
};

type GoogleIntegrationLike = {
  refreshToken: string;
  clientId?: string | null;
};

export type AttachmentExtractionResult = {
  processingStatus: "completed" | "failed";
  extractedContent?: string;
  extractionMethod?: "gemini" | "openai" | "pdf-extract";
  processingError?: string;
  driveThumbnailLink?: string;
  driveWebViewLink?: string;
};

type AnalyticsCtx = {
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">;
  userId: Id<"users">;
  chatTurnId?: Id<"chatMessages">;
  chatMessageId?: Id<"chatMessages">;
  conversationId?: string;
};

// ─── Google Drive helpers ─────────────────────────────────────────────────────

export async function getGoogleDriveAccessToken(
  integration: GoogleIntegrationLike,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: integration.refreshToken,
      client_id: integration.clientId ?? process.env.GOOGLE_CLIENT_ID_WEB ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET_WEB ?? "",
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as { access_token?: string };
  if (!response.ok || !data.access_token) {
    throw new Error("Could not refresh Google access token");
  }
  return data.access_token;
}

async function fetchDriveMetadata(accessToken: string, driveFileId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,thumbnailLink,webViewLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return {};
  const metadata = (await response.json()) as {
    thumbnailLink?: string;
    webViewLink?: string;
  };
  return {
    driveThumbnailLink: metadata.thumbnailLink,
    driveWebViewLink: metadata.webViewLink,
  };
}

async function downloadDriveFile(
  accessToken: string,
  driveFileId: string,
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  return {
    buffer: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

// ─── Image extraction ─────────────────────────────────────────────────────────

const IMAGE_PROMPT =
  "Describe this image concisely for personal memory context. Focus on readable text, dates, names, places, objects, and what is happening. Be specific and factual.";

function buildVisionRequest(filename: string, mimeType: string, base64: string) {
  return {
    max_tokens: 500,
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `${IMAGE_PROMPT} File: ${filename}` },
          {
            type: "image_url" as const,
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" as const },
          },
        ],
      },
    ],
  };
}

async function extractImageWithFallback(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics?: AnalyticsCtx,
): Promise<AttachmentExtractionResult> {
  if (!analytics) {
    return { processingStatus: "failed", processingError: "No user context for image extraction." };
  }

  const route = await resolveAiRoute(analytics.ctx, {
    userId: analytics.userId,
    feature: "attachment_extraction",
  });
  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) {
    return { processingStatus: "failed", processingError: "Could not download image from Drive." };
  }
  const base64 = arrayBufferToBase64(file.buffer);
  const request = buildVisionRequest(filename, file.mimeType, base64);
  const link = {
    chatTurnId: analytics.chatTurnId,
    chatMessageId: analytics.chatMessageId,
    conversationId: analytics.conversationId,
  };

  // BYOK: use only their configured provider — no platform fallback
  if (route.credentialSource === "user_byok") {
    try {
      const response = await trackedChatCompletionOnRoute(analytics.ctx, route, {
        userId: analytics.userId,
        feature: "attachment_extraction",
        stage: "extraction",
        visibility: "background",
        metadata: { attachmentType: "image" },
        link,
        request,
      });
      const text = extractTextContent(response.choices[0]?.message?.content);
      return text?.trim()
        ? {
            processingStatus: "completed",
            extractedContent: text.trim(),
            extractionMethod: route.provider === "openai" ? "openai" : "gemini",
          }
        : { processingStatus: "failed", processingError: "Vision extraction returned no content." };
    } catch {
      return {
        processingStatus: "failed",
        processingError: "Vision extraction failed for this attachment.",
      };
    }
  }

  // Platform: try primary route, then admin-configured fallback
  try {
    const response = await trackedChatCompletionOnRoute(analytics.ctx, route, {
      userId: analytics.userId,
      feature: "attachment_extraction",
      stage: "extraction",
      visibility: "background",
      metadata: { attachmentType: "image" },
      link,
      request,
    });
    const text = extractTextContent(response.choices[0]?.message?.content);
    if (text?.trim()) {
      return {
        processingStatus: "completed",
        extractedContent: text.trim(),
        extractionMethod: route.provider === "openai" ? "openai" : "gemini",
      };
    }
  } catch (primaryError) {
    console.warn(
      "Primary image extraction failed, trying fallback:",
      primaryError instanceof Error ? primaryError.message : primaryError,
    );
  }

  const fallbackRoute = await resolveAiFallbackRoute(analytics.ctx, "attachment_extraction");
  if (!fallbackRoute) {
    return {
      processingStatus: "failed",
      processingError: "Image extraction failed and no fallback route is configured.",
    };
  }

  try {
    const response = await trackedChatCompletionOnRoute(analytics.ctx, fallbackRoute, {
      userId: analytics.userId,
      feature: "attachment_extraction",
      stage: "extraction_fallback",
      visibility: "background",
      metadata: { attachmentType: "image" },
      link,
      request,
    });
    const text = extractTextContent(response.choices[0]?.message?.content);
    if (text?.trim()) {
      return {
        processingStatus: "completed",
        extractedContent: text.trim(),
        extractionMethod: fallbackRoute.provider === "openai" ? "openai" : "gemini",
      };
    }
  } catch (fallbackError) {
    console.warn(
      "Fallback image extraction also failed:",
      fallbackError instanceof Error ? fallbackError.message : fallbackError,
    );
  }

  return {
    processingStatus: "failed",
    processingError: "Image extraction failed with both primary and fallback providers.",
  };
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

const PDF_EXTRACT_PROMPT =
  "Extract all readable text and key factual details from this PDF document. Return plain text only.";

async function extractPdfContent(
  accessToken: string,
  driveFileId: string,
  textLimit: number,
  analytics?: AnalyticsCtx,
): Promise<{ text: string; method: "gemini" | "openai" | "pdf-extract" } | undefined> {
  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) throw new Error("Could not download document attachment from Google Drive");

  const bytes = new Uint8Array(file.buffer);
  const rawText = extractTextFromPdfBytes(bytes).trim();

  if (rawText.length >= 20) {
    return { text: rawText.slice(0, textLimit).trim(), method: "pdf-extract" };
  }

  // Scanned PDF: route through the AI provider system
  if (!analytics) return undefined;

  const base64 = arrayBufferToBase64(file.buffer);
  const pdfRequest = {
    max_tokens: 800,
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: PDF_EXTRACT_PROMPT },
          {
            type: "image_url" as const,
            image_url: { url: `data:application/pdf;base64,${base64}` },
          },
        ],
      },
    ],
  };

  const route = await resolveAiRoute(analytics.ctx, {
    userId: analytics.userId,
    feature: "attachment_extraction",
  });
  const link = {
    chatTurnId: analytics.chatTurnId,
    chatMessageId: analytics.chatMessageId,
    conversationId: analytics.conversationId,
  };

  // For BYOK and platform primary, try the resolved route first
  try {
    const response = await trackedChatCompletionOnRoute(analytics.ctx, route, {
      userId: analytics.userId,
      feature: "attachment_extraction",
      stage: "pdf_extraction",
      visibility: "background",
      metadata: { attachmentType: "document" },
      link,
      request: pdfRequest,
    });
    const text = extractTextContent(response.choices[0]?.message?.content);
    if (text?.trim()) {
      return {
        text: text.trim().slice(0, textLimit),
        method: route.provider === "openai" ? "openai" : "gemini",
      };
    }
  } catch (primaryError) {
    if (route.credentialSource !== "user_byok") {
      console.warn(
        "Primary PDF extraction failed, trying fallback:",
        primaryError instanceof Error ? primaryError.message : primaryError,
      );
    } else {
      throw primaryError;
    }
  }

  // Platform fallback
  if (route.credentialSource === "user_byok") return undefined;

  const fallbackRoute = await resolveAiFallbackRoute(analytics.ctx, "attachment_extraction");
  if (!fallbackRoute) return undefined;

  try {
    const response = await trackedChatCompletionOnRoute(analytics.ctx, fallbackRoute, {
      userId: analytics.userId,
      feature: "attachment_extraction",
      stage: "pdf_extraction_fallback",
      visibility: "background",
      metadata: { attachmentType: "document" },
      link,
      request: pdfRequest,
    });
    const text = extractTextContent(response.choices[0]?.message?.content);
    if (text?.trim()) {
      return {
        text: text.trim().slice(0, textLimit),
        method: fallbackRoute.provider === "openai" ? "openai" : "gemini",
      };
    }
  } catch {
    // Fallback also failed — return undefined to signal no extraction
  }

  return undefined;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function extractAttachmentFromDrive(args: {
  accessToken: string;
  attachment: AttachmentLike;
  textLimit?: number;
  analytics?: AnalyticsCtx;
}): Promise<AttachmentExtractionResult> {
  const { accessToken, attachment, textLimit = ATTACHMENT_TEXT_LIMIT } = args;
  let driveThumbnailLink = attachment.driveThumbnailLink;
  let driveWebViewLink = attachment.driveWebViewLink;

  try {
    const metadata = await fetchDriveMetadata(accessToken, attachment.driveFileId);
    driveThumbnailLink = metadata.driveThumbnailLink ?? driveThumbnailLink;
    driveWebViewLink = metadata.driveWebViewLink ?? driveWebViewLink;

    if (attachment.type === "image") {
      const imageResult = await extractImageWithFallback(
        accessToken,
        attachment.driveFileId,
        attachment.filename,
        args.analytics,
      );
      return { ...imageResult, driveThumbnailLink, driveWebViewLink };
    }

    const pdfResult = await extractPdfContent(
      accessToken,
      attachment.driveFileId,
      textLimit,
      args.analytics,
    );
    if (!pdfResult) {
      return {
        processingStatus: "failed",
        processingError: "Could not extract content from document attachment",
        driveThumbnailLink,
        driveWebViewLink,
      };
    }
    return {
      processingStatus: "completed",
      extractedContent: pdfResult.text,
      extractionMethod: pdfResult.method,
      driveThumbnailLink,
      driveWebViewLink,
    };
  } catch (error) {
    return {
      processingStatus: "failed",
      processingError: error instanceof Error ? error.message : "Unknown error during extraction",
      driveThumbnailLink,
      driveWebViewLink,
    };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(buffer);
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const slice = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
    chunks.push(String.fromCharCode(...(slice as unknown as number[])));
  }
  return btoa(chunks.join(""));
}

function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const textParts: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\([\d]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      const cleaned = decoded
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length > 0) textParts.push(cleaned);
    }
  }
  return textParts.join("\n").trim();
}
