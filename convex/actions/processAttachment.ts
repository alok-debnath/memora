"use node";

import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getOpenAIClient, OPENAI_CHAT_MODEL, extractTextContent } from "../lib/openai";

/**
 * Background action: download an attachment from Drive and extract content via AI.
 * - Images: OpenAI vision (gpt-4o) describes the image for memory context
 * - PDFs: downloads bytes, extracts embedded text, summarizes if long
 */
export const processAttachment = internalAction({
  args: {
    attachmentId: v.id("memoryAttachments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Mark as processing
    await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
      attachmentId: args.attachmentId,
      processingStatus: "processing",
    });

    try {
      const attachment = await ctx.runQuery(internal.attachments.getAttachmentInternal, {
        attachmentId: args.attachmentId,
      });
      if (!attachment) {
        await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: args.attachmentId,
          processingStatus: "failed",
          processingError: "Attachment record not found",
        });
        return;
      }

      const integration = await ctx.runQuery(
        internal.integrations.getGoogleIntegrationInternal,
        { userId: args.userId }
      );
      if (!integration) {
        await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: args.attachmentId,
          processingStatus: "failed",
          processingError: "Google integration not connected",
        });
        return;
      }

      // Refresh access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: integration.refreshToken,
          client_id: integration.clientId ?? process.env.GOOGLE_CLIENT_ID_WEB ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET_WEB ?? "",
          grant_type: "refresh_token",
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string };
      if (!tokenData.access_token) {
        await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: args.attachmentId,
          processingStatus: "failed",
          processingError: "Could not refresh Google access token",
        });
        return;
      }
      const accessToken = tokenData.access_token;

      // Fetch Drive file metadata to get thumbnailLink if not already stored
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${attachment.driveFileId}?fields=id,name,thumbnailLink,webViewLink`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const meta = await metaRes.json() as {
        thumbnailLink?: string;
        webViewLink?: string;
      };

      const client = getOpenAIClient();
      let extractedContent: string | undefined;

      if (attachment.type === "image") {
        extractedContent = await extractImageContent(
          accessToken,
          attachment.driveFileId,
          attachment.filename,
          client
        );
      } else {
        extractedContent = await extractPdfContent(
          accessToken,
          attachment.driveFileId,
          client
        );
      }

      await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
        attachmentId: args.attachmentId,
        processingStatus: "completed",
        extractedContent,
        driveThumbnailLink: meta.thumbnailLink ?? attachment.driveThumbnailLink,
        driveWebViewLink: meta.webViewLink ?? attachment.driveWebViewLink,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during extraction";
      console.error("processAttachment error:", err);
      await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
        attachmentId: args.attachmentId,
        processingStatus: "failed",
        processingError: message,
      });
    }
  },
});

async function extractImageContent(
  accessToken: string,
  driveFileId: string,
  filename: string,
  client: ReturnType<typeof getOpenAIClient>
): Promise<string | undefined> {
  if (!client) return undefined;

  // Download image bytes from Drive
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return undefined;

  const buffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Describe this image concisely for personal memory context. Focus on key details: people, objects, location, text visible, and what's happening. Be specific and factual. File: ${filename}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${contentType};base64,${base64}`, detail: "low" },
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

async function extractPdfContent(
  accessToken: string,
  driveFileId: string,
  client: ReturnType<typeof getOpenAIClient>
): Promise<string | undefined> {
  // Download PDF bytes from Drive
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return undefined;

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Extract embedded text from PDF (simple approach: scan for text streams)
  const rawText = extractTextFromPdfBytes(bytes);
  if (!rawText || rawText.length < 20) return undefined;

  // Summarize if too long
  if (rawText.length <= 3000) return rawText.trim();

  if (!client) return rawText.slice(0, 3000).trim();

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Summarize this document concisely for personal memory context. Capture key facts, dates, names, amounts, and important details. Be specific.",
        },
        {
          role: "user",
          content: rawText.slice(0, 12000),
        },
      ],
    });
    return extractTextContent(response.choices[0]?.message?.content) || rawText.slice(0, 3000).trim();
  } catch {
    return rawText.slice(0, 3000).trim();
  }
}

/**
 * Convert an ArrayBuffer to a base64 string without using Node's Buffer type,
 * which Convex's TypeScript environment maps to a restricted shim.
 */
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

/**
 * Minimal PDF text extraction without external dependencies.
 * Scans for BT...ET text blocks and decodes text strings.
 */
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  const textParts: string[] = [];
  // Match text between BT and ET markers
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract strings inside parentheses (Tj, TJ operators)
    const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\([\d]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      textParts.push(decoded);
    }
  }

  return textParts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
