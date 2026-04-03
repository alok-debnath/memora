"use node";

import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  embedTexts,
  extractTextContent,
  getOpenAIClient,
  OPENAI_CHAT_MODEL,
  safeJsonParse,
} from "../lib/openai";
import {
  normalizeDocumentMemory,
  normalizeKeyDetails,
} from "../lib/aiNormalization";

type ExtractedDocumentResult = {
  extractedText?: string;
  summary?: string;
  documentType?: string;
  expiryDate?: string | null;
  keyDetails?: Record<string, string>;
  memories?: Array<{
    title?: string;
    content?: string;
    importance?: "critical" | "high" | "normal" | "low";
    people?: string[];
    locations?: string[];
  }>;
};

export const processDocument = action({
  args: {
    extractionId: v.id("documentExtractions"),
    text: v.string(),
    userId: v.id("users"),
    userTimezone: v.optional(v.string()),
    // Legacy: keep token optional for backwards compat but don't require it
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;

    const client = getOpenAIClient();
    if (!client) {
      await ctx.runMutation(internal.processDocumentMutations.updateExtractionStatus, {
        extractionId: args.extractionId,
        status: "failed",
      });
      return;
    }

    await ctx.runMutation(internal.processDocumentMutations.updateExtractionStatus, {
      extractionId: args.extractionId,
      status: "processing",
    });

    try {
      const response = await client.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are a document analysis AI. Extract ALL text and information from this document. Identify the document type (warranty, receipt, invoice, certificate, contract, manual, insurance, or other). Extract key details like brand, model, serial number, purchase date, expiry or end date, coverage, amounts, provider, and notes. Generate memory notes from the document content - each should be a standalone, useful piece of information. Be thorough and precise with dates. Return only valid JSON with fields: extractedText, summary, documentType, expiryDate, keyDetails, memories (array of {title, content, importance, people, locations}).',
          },
          {
            role: "user",
            content: `Analyze this document and extract all information. Pay special attention to dates, warranty periods, and expiry information.

${args.text.slice(0, 15000)}`,
          },
        ],
      });

      const result =
        safeJsonParse<ExtractedDocumentResult>(
          extractTextContent(response.choices[0]?.message?.content)
        ) ?? {};

      const extractedMemories = Array.isArray(result.memories)
        ? result.memories
            .slice(0, 10)
            .map((memory) => normalizeDocumentMemory(memory as Record<string, unknown>))
        : [];

      let documentEmbedding: number[] | undefined;
      let memoryEmbeddings: Array<number[] | undefined> = [];

      try {
        const inputs = [
          `${result.summary || ""}\n\n${result.extractedText || args.text.slice(0, 4000)}`,
          ...extractedMemories.map(
            (memory) => `${memory.title || "Extracted Memory"}\n${memory.content || ""}`
          ),
        ];
        const embeddings = await embedTexts(inputs);
        documentEmbedding = embeddings[0];
        memoryEmbeddings = embeddings.slice(1);
      } catch {
        documentEmbedding = undefined;
        memoryEmbeddings = [];
      }

      const memoryIds: Id<"memories">[] = [];
      for (const [index, memory] of extractedMemories.entries()) {
        const id = await ctx.runMutation(
          internal.processDocumentMutations.createExtractedMemory,
          {
            userId,
            title: memory.title || "Extracted Memory",
            content: memory.content || "",
            people: memory.people ?? [],
            locations: memory.locations ?? [],
            importance: memory.importance ?? "normal",
            embedding: memoryEmbeddings[index],
          }
        );
        // Schedule topic assignment for each extracted memory
        const memEmbed = memoryEmbeddings[index];
        if (memEmbed) {
          await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
            memoryId: id,
            userId,
            title: memory.title || "Extracted Memory",
            content: memory.content || "",
            embedding: memEmbed,
          });
        }
        memoryIds.push(id);
      }

      await ctx.runMutation(internal.processDocumentMutations.completeExtraction, {
        extractionId: args.extractionId,
        summary: result.summary || "",
        memoryCount: memoryIds.length,
        documentType: result.documentType || "other",
        expiryDate: typeof result.expiryDate === "string" ? result.expiryDate : undefined,
        keyDetails: normalizeKeyDetails(result.keyDetails),
        embedding: documentEmbedding,
        generatedMemoryIds: memoryIds,
      });

      // Auto-set reminder 30 days before expiry for warranty/insurance/certificate
      if (
        typeof result.expiryDate === "string" &&
        ["warranty", "insurance", "certificate"].includes(
          (result.documentType || "other").toLowerCase()
        )
      ) {
        const expiryDate = new Date(result.expiryDate);
        if (!Number.isNaN(expiryDate.getTime())) {
          const reminderDate = new Date(expiryDate);
          reminderDate.setDate(reminderDate.getDate() - 30);
          if (reminderDate.getTime() > Date.now() && memoryIds[0]) {
            await ctx.runMutation(internal.processDocumentMutations.setMemoryReminder, {
              memoryId: memoryIds[0],
              dueAt: reminderDate.toISOString(),
            });
          }
        }
      }
    } catch {
      await ctx.runMutation(internal.processDocumentMutations.updateExtractionStatus, {
        extractionId: args.extractionId,
        status: "failed",
      });
    }
  },
});
