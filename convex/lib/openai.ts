"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";

let cachedClient: OpenAI | null | undefined;

function getApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY ?? null;
}

function getBaseURL() {
  return process.env.OPENAI_BASE_URL ?? process.env.CONVEX_OPENAI_BASE_URL;
}

export function hasOpenAI() {
  return Boolean(getApiKey());
}

export function getOpenAIClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new OpenAI({
    apiKey,
    ...(getBaseURL() ? { baseURL: getBaseURL() } : {}),
  });
  return cachedClient;
}

export function requireOpenAI() {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured in Convex.");
  }
  return client;
}

export function extractTextContent(
  content: string | Array<{ type?: string; text?: string }> | null | undefined
) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) =>
      typeof part === "object" && part?.type === "text" && typeof part.text === "string"
        ? part.text
        : ""
    )
    .join("")
    .trim();
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    const trimmed = raw.trim();
    const json = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      : trimmed;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function embedTexts(input: string | string[]) {
  const client = requireOpenAI();
  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input,
  });
  return response.data.map((item) => item.embedding);
}

export async function embedText(input: string) {
  const [embedding] = await embedTexts(input);
  return embedding;
}

export async function transcribeBase64Audio(args: {
  audioBase64: string;
  format: string;
  language?: string;
}) {
  const client = requireOpenAI();
  const audio = Buffer.from(args.audioBase64, "base64");
  const file = await toFile(audio, `recording.${args.format}`);

  return await client.audio.transcriptions.create({
    file,
    model: OPENAI_TRANSCRIPTION_MODEL,
    ...(args.language ? { language: args.language } : {}),
  });
}
