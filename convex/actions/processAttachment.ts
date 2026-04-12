"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { extractAttachmentFromDrive, getGoogleDriveAccessToken } from "../lib/attachmentExtraction";

/**
 * Background action: download an attachment from Drive and extract content.
 * - Images: Gemini Flash vision
 * - PDFs with readable text: pure-JS text extraction
 * - Scanned PDFs: Gemini Flash extraction
 */
export const processAttachment = internalAction({
  args: {
    attachmentId: v.id("memoryAttachments"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
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

      const integration = await ctx.runQuery(internal.integrations.getGoogleIntegrationInternal, {
        userId: args.userId,
      });
      if (!integration) {
        await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
          attachmentId: args.attachmentId,
          processingStatus: "failed",
          processingError: "Google integration not connected",
        });
        return;
      }

      const accessToken = await getGoogleDriveAccessToken({
        refreshToken: integration.refreshToken,
        clientId: integration.clientId,
      });
      const result = await extractAttachmentFromDrive({
        accessToken,
        attachment: {
          type: attachment.type,
          filename: attachment.filename,
          driveFileId: attachment.driveFileId,
          driveThumbnailLink: attachment.driveThumbnailLink,
          driveWebViewLink: attachment.driveWebViewLink,
        },
        analytics: {
          ctx,
          userId: args.userId,
        },
      });

      await ctx.runMutation(internal.attachments.updateAttachmentStatus, {
        attachmentId: args.attachmentId,
        processingStatus: result.processingStatus,
        extractedContent: result.extractedContent,
        processingError: result.processingError,
        extractionMethod: result.extractionMethod,
        driveThumbnailLink: result.driveThumbnailLink,
        driveWebViewLink: result.driveWebViewLink,
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
