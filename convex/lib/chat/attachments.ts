"use node";

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
  ATTACHMENT_TEXT_LIMIT,
  extractAttachmentFromDrive,
  getGoogleDriveAccessToken,
} from "../attachmentExtraction";
import type {
  ChatAttachmentExtraction,
  ChatAttachmentRecord,
  ParsedAttachment,
  StreamingStatus,
} from "./types";

function driveLinkFields(attachment: { driveThumbnailLink?: string; driveWebViewLink?: string }) {
  return {
    ...(attachment.driveThumbnailLink ? { driveThumbnailLink: attachment.driveThumbnailLink } : {}),
    ...(attachment.driveWebViewLink ? { driveWebViewLink: attachment.driveWebViewLink } : {}),
  };
}

export function parseAttachments(message: string): ParsedAttachment[] {
  const matches = message.matchAll(/\[Attached file:\s*(.+?)\s*\((.+?)\)\s*-\s*URL:\s*(.+?)\]/g);

  return Array.from(matches, (match) => ({
    name: match[1]?.trim() || "Attachment",
    fileType: match[2]?.trim() || "application/octet-stream",
    url: match[3]?.trim() || "",
  })).filter((item) => item.url);
}

export async function extractChatAttachmentsForConversation(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    attachments: ChatAttachmentRecord[];
    setStreamingStatus: (status: StreamingStatus) => Promise<void>;
    chatTurnId: Id<"chatMessages">;
  },
): Promise<ChatAttachmentExtraction[]> {
  if (args.attachments.length === 0) {
    return [];
  }

  await args.setStreamingStatus({
    phase: "loading",
    toolName: "attachment_extraction",
    detail: `Reading ${args.attachments.length} attachment${args.attachments.length === 1 ? "" : "s"}`,
    source: "attachments",
    events: [
      { label: "Images", value: "Gemini extraction" },
      {
        label: "PDFs",
        value: `direct text up to ${ATTACHMENT_TEXT_LIMIT} chars`,
      },
    ],
    step: 1,
    totalSteps: 4,
  });

  const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
    userId: args.userId,
  });
  if (!integration) {
    const errorMessage = "Google integration not connected";
    await Promise.all(
      args.attachments.map((attachment) =>
        ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: attachment.attachmentId,
          processingStatus: "failed",
          processingError: errorMessage,
          ...driveLinkFields(attachment),
        }),
      ),
    );
    return args.attachments.map((attachment) => ({
      ...attachment,
      processingStatus: "failed" as const,
      processingError: errorMessage,
      ...driveLinkFields(attachment),
    }));
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleDriveAccessToken({
      refreshToken: integration.refreshToken,
      clientId: integration.clientId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Could not refresh Google access token";
    await Promise.all(
      args.attachments.map((attachment) =>
        ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: attachment.attachmentId,
          processingStatus: "failed",
          processingError: errorMessage,
          ...driveLinkFields(attachment),
        }),
      ),
    );
    return args.attachments.map((attachment) => ({
      ...attachment,
      processingStatus: "failed" as const,
      processingError: errorMessage,
      ...driveLinkFields(attachment),
    }));
  }

  const results: ChatAttachmentExtraction[] = [];
  for (const attachment of args.attachments) {
    await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
      attachmentId: attachment.attachmentId,
      processingStatus: "processing",
      ...driveLinkFields(attachment),
    });

    const result = await extractAttachmentFromDrive({
      accessToken,
      attachment: {
        type: attachment.type,
        filename: attachment.name,
        driveFileId: attachment.driveFileId,
        driveThumbnailLink: attachment.driveThumbnailLink,
        driveWebViewLink: attachment.driveWebViewLink,
      },
      textLimit: ATTACHMENT_TEXT_LIMIT,
      analytics: {
        ctx,
        userId: args.userId,
        chatTurnId: args.chatTurnId,
        chatMessageId: args.chatTurnId,
      },
    });

    await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
      attachmentId: attachment.attachmentId,
      processingStatus: result.processingStatus,
      ...(result.extractedContent !== undefined
        ? { extractedContent: result.extractedContent }
        : {}),
      ...(result.processingError !== undefined ? { processingError: result.processingError } : {}),
      ...(result.extractionMethod !== undefined
        ? { extractionMethod: result.extractionMethod }
        : {}),
      ...driveLinkFields(result),
    });

    results.push({
      ...attachment,
      processingStatus: result.processingStatus,
      ...(result.extractedContent !== undefined
        ? { extractedContent: result.extractedContent }
        : {}),
      ...(result.processingError !== undefined ? { processingError: result.processingError } : {}),
      ...(result.extractionMethod !== undefined
        ? { extractionMethod: result.extractionMethod }
        : {}),
      ...driveLinkFields(result),
    });
  }

  return results;
}
