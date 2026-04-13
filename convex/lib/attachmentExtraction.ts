"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { extractTextContent, resolveAiRoute, trackedChatCompletion } from "./aiDispatch";
import { DEFAULT_AI_PRICING_VERSION, resolveBilledTo } from "./aiPricing";
import { callGoogleVisionDirect, getPlatformGoogleApiKey } from "./providers/google";
import { getOpenAIClientDirect } from "./providers/openai";

export const ATTACHMENT_TEXT_LIMIT = 3000;

const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash";

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

async function extractImageByok(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics: AnalyticsCtx,
): Promise<string | undefined> {
  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) return undefined;
  const base64 = arrayBufferToBase64(file.buffer);
  try {
    const response = await trackedChatCompletion(analytics.ctx, {
      userId: analytics.userId,
      feature: "attachment_extraction",
      stage: "extraction",
      visibility: "background",
      metadata: { attachmentType: "image" },
      link: {
        chatTurnId: analytics.chatTurnId,
        chatMessageId: analytics.chatMessageId,
        conversationId: analytics.conversationId,
      },
      request: {
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${IMAGE_PROMPT} File: ${filename}` },
              {
                type: "image_url",
                image_url: { url: `data:${file.mimeType};base64,${base64}`, detail: "low" },
              },
            ],
          },
        ],
      },
    });
    return extractTextContent(response.choices[0]?.message?.content) || undefined;
  } catch {
    return undefined;
  }
}

async function extractImagePlatformGemini(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics: AnalyticsCtx,
): Promise<string | undefined> {
  const apiKey = getPlatformGoogleApiKey();
  if (!apiKey) return undefined;

  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) return undefined;
  const base64 = arrayBufferToBase64(file.buffer);

  const startedAt = Date.now();
  try {
    const text = await callGoogleVisionDirect({
      apiKey,
      model: GEMINI_VISION_MODEL,
      body: {
        contents: [
          {
            parts: [
              { text: `${IMAGE_PROMPT} File: ${filename}` },
              { inline_data: { mime_type: file.mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 500 },
      },
    });
    await analytics.ctx.runMutation(internal.analytics.recordAiUsage, {
      userId: analytics.userId,
      provider: "google",
      model: GEMINI_VISION_MODEL,
      operation: "vision_extract",
      feature: "attachment_extraction",
      stage: "extraction",
      visibility: "background",
      status: "success",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
      billedTo: "memora",
      credentialSource: "platform",
      billingOwner: "platform",
      routingReason: "platform_default",
      metadata: { attachmentType: "image" },
    });
    return text;
  } catch (error) {
    await analytics.ctx.runMutation(internal.analytics.recordAiUsage, {
      userId: analytics.userId,
      provider: "google",
      model: GEMINI_VISION_MODEL,
      operation: "vision_extract",
      feature: "attachment_extraction",
      stage: "extraction",
      visibility: "background",
      status: "error",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
      billedTo: "memora",
      credentialSource: "platform",
      billingOwner: "platform",
      routingReason: "platform_default",
      metadata: { attachmentType: "image" },
    });
    throw error;
  }
}

async function extractImagePlatformOpenAiFallback(
  accessToken: string,
  driveFileId: string,
  filename: string,
): Promise<string | undefined> {
  const openaiClient = getOpenAIClientDirect();
  if (!openaiClient) return undefined;

  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) return undefined;
  const base64 = arrayBufferToBase64(file.buffer);

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${IMAGE_PROMPT} File: ${filename}` },
            {
              type: "image_url",
              image_url: { url: `data:${file.mimeType};base64,${base64}`, detail: "low" },
            },
          ],
        },
      ],
    });
    return extractTextContent(response.choices[0]?.message?.content) || undefined;
  } catch {
    return undefined;
  }
}

async function extractImageWithFallback(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics?: AnalyticsCtx,
): Promise<AttachmentExtractionResult> {
  const route = analytics
    ? await resolveAiRoute(analytics.ctx, {
        userId: analytics.userId,
        feature: "attachment_extraction",
      })
    : null;

  // BYOK: use only their configured provider — no platform fallback
  if (route?.credentialSource === "user_byok" && analytics) {
    const extracted = await extractImageByok(accessToken, driveFileId, filename, analytics);
    return extracted
      ? {
          processingStatus: "completed",
          extractedContent: extracted,
          extractionMethod: route.provider === "openai" ? "openai" : "gemini",
        }
      : {
          processingStatus: "failed",
          processingError: "Vision extraction failed for this attachment.",
        };
  }

  // Platform: Gemini first, GPT-4o fallback
  if (analytics) {
    try {
      const extracted = await extractImagePlatformGemini(
        accessToken,
        driveFileId,
        filename,
        analytics,
      );
      if (extracted?.trim()) {
        return {
          processingStatus: "completed",
          extractedContent: extracted.trim(),
          extractionMethod: "gemini",
        };
      }
    } catch (geminiError) {
      console.warn(
        "Platform Gemini image extraction failed, falling back to OpenAI:",
        geminiError instanceof Error ? geminiError.message : geminiError,
      );
    }
  }

  const fallback = await extractImagePlatformOpenAiFallback(accessToken, driveFileId, filename);
  if (fallback?.trim()) {
    return {
      processingStatus: "completed",
      extractedContent: fallback.trim(),
      extractionMethod: "openai",
    };
  }

  return {
    processingStatus: "failed",
    processingError: "Image extraction failed with both Gemini and OpenAI vision.",
  };
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

async function extractPdfContent(
  accessToken: string,
  driveFileId: string,
  textLimit: number,
  analytics?: AnalyticsCtx,
): Promise<{ text: string; method: "gemini" | "pdf-extract" } | undefined> {
  const file = await downloadDriveFile(accessToken, driveFileId);
  if (!file) throw new Error("Could not download document attachment from Google Drive");

  const bytes = new Uint8Array(file.buffer);
  const rawText = extractTextFromPdfBytes(bytes).trim();

  if (rawText.length >= 20) {
    return { text: rawText.slice(0, textLimit).trim(), method: "pdf-extract" };
  }

  // Scanned PDF: use Gemini
  const apiKey = getPlatformGoogleApiKey();
  if (!apiKey) return undefined;

  const base64 = arrayBufferToBase64(file.buffer);
  const startedAt = Date.now();
  let description: string | undefined;
  try {
    description = await callGoogleVisionDirect({
      apiKey,
      model: GEMINI_VISION_MODEL,
      body: {
        contents: [
          {
            parts: [
              {
                text: "Extract all readable text and key factual details from this PDF document. Return plain text only.",
              },
              { inline_data: { mime_type: "application/pdf", data: base64 } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 800 },
      },
    });
    if (analytics) {
      await analytics.ctx.runMutation(internal.analytics.recordAiUsage, {
        userId: analytics.userId,
        provider: "google",
        model: GEMINI_VISION_MODEL,
        operation: "pdf_extract",
        feature: "attachment_extraction",
        stage: "extraction",
        visibility: "background",
        status: "success",
        latencyMs: Date.now() - startedAt,
        costAvailability: "unavailable",
        billedTo: "memora",
        credentialSource: "platform",
        billingOwner: "platform",
        routingReason: "platform_default",
        metadata: { attachmentType: "document" },
      });
    }
  } catch (error) {
    if (analytics) {
      await analytics.ctx.runMutation(internal.analytics.recordAiUsage, {
        userId: analytics.userId,
        provider: "google",
        model: GEMINI_VISION_MODEL,
        operation: "pdf_extract",
        feature: "attachment_extraction",
        stage: "extraction",
        visibility: "background",
        status: "error",
        latencyMs: Date.now() - startedAt,
        costAvailability: "unavailable",
        billedTo: "memora",
        credentialSource: "platform",
        billingOwner: "platform",
        routingReason: "platform_default",
        metadata: { attachmentType: "document" },
      });
    }
    throw error;
  }

  if (!description) return undefined;
  return { text: description.trim(), method: "gemini" };
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
