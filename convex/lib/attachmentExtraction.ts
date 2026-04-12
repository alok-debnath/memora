"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { extractTextContent, getOpenAIClient, trackedChatCompletion } from "./openai";

export const ATTACHMENT_TEXT_LIMIT = 3000;

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

export async function extractAttachmentFromDrive(args: {
  accessToken: string;
  attachment: AttachmentLike;
  textLimit?: number;
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  };
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
      return {
        ...imageResult,
        driveThumbnailLink,
        driveWebViewLink,
      };
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

async function fetchDriveMetadata(accessToken: string, driveFileId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,thumbnailLink,webViewLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    return {};
  }

  const metadata = (await response.json()) as {
    thumbnailLink?: string;
    webViewLink?: string;
  };
  return {
    driveThumbnailLink: metadata.thumbnailLink,
    driveWebViewLink: metadata.webViewLink,
  };
}

async function callGemini(body: object): Promise<string | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in Convex.");
  }

  const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `Gemini request failed with status ${response.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || undefined;
}

async function recordGeminiUsage(args: {
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  };
  model: string;
  operation: string;
  status: "success" | "error";
  latencyMs: number;
  metadata?: Record<string, string>;
}) {
  if (!args.analytics) {
    return;
  }
  await args.analytics.ctx.runMutation(internal.analytics.recordAiUsage, {
    userId: args.analytics.userId,
    chatTurnId: args.analytics.chatTurnId,
    chatMessageId: args.analytics.chatMessageId,
    conversationId: args.analytics.conversationId,
    provider: "google",
    model: args.model,
    operation: args.operation,
    feature: "attachment_extraction",
    stage: "extraction",
    visibility: "background",
    status: args.status,
    latencyMs: args.latencyMs,
    costAvailability: "unavailable",
    metadata: args.metadata,
  });
}

async function extractImageWithGemini(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  },
): Promise<string | undefined> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error("Could not download image attachment from Google Drive");
  }

  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";

  const startedAt = Date.now();
  try {
    const result = await callGemini({
      contents: [
        {
          parts: [
            {
              text: `Describe this image concisely for personal memory context. Focus on readable text, dates, names, places, objects, and what is happening. Be specific and factual. File: ${filename}`,
            },
            {
              inline_data: { mime_type: mimeType, data: base64 },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 500 },
    });
    await recordGeminiUsage({
      analytics,
      model: GEMINI_MODEL,
      operation: "vision_extract",
      status: "success",
      latencyMs: Date.now() - startedAt,
      metadata: { attachmentType: "image" },
    });
    return result;
  } catch (error) {
    await recordGeminiUsage({
      analytics,
      model: GEMINI_MODEL,
      operation: "vision_extract",
      status: "error",
      latencyMs: Date.now() - startedAt,
      metadata: { attachmentType: "image" },
    });
    throw error;
  }
}

async function extractImageWithFallback(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  },
): Promise<AttachmentExtractionResult> {
  try {
    const geminiText = await extractImageWithGemini(accessToken, driveFileId, filename, analytics);
    if (geminiText?.trim()) {
      return {
        processingStatus: "completed",
        extractedContent: geminiText.trim(),
        extractionMethod: "gemini",
      };
    }
  } catch (geminiError) {
    const openAiFallback = await extractImageWithOpenAI(
      accessToken,
      driveFileId,
      filename,
      analytics,
    );
    if (openAiFallback) {
      return {
        processingStatus: "completed",
        extractedContent: openAiFallback,
        extractionMethod: "openai",
      };
    }

    return {
      processingStatus: "failed",
      processingError:
        geminiError instanceof Error ? geminiError.message : "Image extraction failed",
    };
  }

  const openAiFallback = await extractImageWithOpenAI(
    accessToken,
    driveFileId,
    filename,
    analytics,
  );
  if (openAiFallback) {
    return {
      processingStatus: "completed",
      extractedContent: openAiFallback,
      extractionMethod: "openai",
    };
  }

  return {
    processingStatus: "failed",
    processingError: "Could not analyze image attachment",
  };
}

async function extractImageWithOpenAI(
  accessToken: string,
  driveFileId: string,
  filename: string,
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  },
): Promise<string | undefined> {
  const client = getOpenAIClient();
  if (!client) {
    return undefined;
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    return undefined;
  }

  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";

  try {
    const request = {
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `Describe this image concisely for personal memory context. Focus on readable text, dates, names, places, objects, and what is happening. Be specific and factual. File: ${filename}`,
            },
            {
              type: "image_url" as const,
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "low" as const,
              },
            },
          ],
        },
      ],
    };
    const visionResponse = analytics
      ? await trackedChatCompletion(analytics.ctx, {
          userId: analytics.userId,
          feature: "attachment_extraction",
          model: "gpt-4o",
          stage: "extraction",
          visibility: "background",
          metadata: { attachmentType: "image", fallback: "openai" },
          link: {
            chatTurnId: analytics.chatTurnId,
            chatMessageId: analytics.chatMessageId,
            conversationId: analytics.conversationId,
          },
          request,
        })
      : await client.chat.completions.create(request);

    const extracted = extractTextContent(visionResponse.choices[0]?.message?.content);
    return extracted.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function extractPdfContent(
  accessToken: string,
  driveFileId: string,
  textLimit: number,
  analytics?: {
    ctx: Pick<ActionCtx, "runMutation">;
    userId: Id<"users">;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
  },
): Promise<{ text: string; method: "gemini" | "pdf-extract" } | undefined> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error("Could not download document attachment from Google Drive");
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const rawText = extractTextFromPdfBytes(bytes).trim();

  if (rawText.length >= 20) {
    return {
      text: rawText.slice(0, textLimit).trim(),
      method: "pdf-extract",
    };
  }

  const base64 = arrayBufferToBase64(buffer);
  const startedAt = Date.now();
  let description: string | undefined;
  try {
    description = await callGemini({
      contents: [
        {
          parts: [
            {
              text: "Extract all readable text and key factual details from this PDF document. Return plain text only.",
            },
            {
              inline_data: { mime_type: "application/pdf", data: base64 },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 800 },
    });
    await recordGeminiUsage({
      analytics,
      model: GEMINI_MODEL,
      operation: "pdf_extract",
      status: "success",
      latencyMs: Date.now() - startedAt,
      metadata: { attachmentType: "document" },
    });
  } catch (error) {
    await recordGeminiUsage({
      analytics,
      model: GEMINI_MODEL,
      operation: "pdf_extract",
      status: "error",
      latencyMs: Date.now() - startedAt,
      metadata: { attachmentType: "document" },
    });
    throw error;
  }

  if (!description) {
    return undefined;
  }

  return {
    text: description.trim(),
    method: "gemini",
  };
}

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
      if (cleaned.length > 0) {
        textParts.push(cleaned);
      }
    }
  }

  return textParts.join("\n").trim();
}
