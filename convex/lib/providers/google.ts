"use node";

import type OpenAI from "openai";
import type { AiProviderAdapter, ChatUsage, EmbeddingsResult, ResolvedRoute } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_EMBEDDING_DIMENSION = 1536;

function getPlatformApiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? null;
}

function apiBase(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}`;
}

// ─── Content translation helpers ─────────────────────────────────────────────

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

/**
 * Translate an OpenAI message content array into Google's `parts` array.
 * Handles both text and image_url (base64 data URIs) parts.
 * image_url parts with external URLs are converted to text references since
 * Google's inline API requires base64 data.
 */
function toGoogleParts(
  content: string | OpenAIContentPart[] | null | undefined,
): Array<Record<string, unknown>> {
  if (!content) return [];
  if (typeof content === "string") return [{ text: content }];

  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    if (part.type === "image_url") {
      const url = part.image_url.url;
      // Base64 data URI: data:<mime>;base64,<data>
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { inline_data: { mime_type: match[1], data: match[2] } };
      }
      // External URL — not directly supported; include as text description
      return { text: `[Image: ${url}]` };
    }
    return { text: "" };
  });
}

function buildSchemaInstructions(
  request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">,
): string {
  const tool = request.tools?.[0];
  if (request.tool_choice && tool && "function" in tool) {
    return `Return JSON only for function "${tool.function.name}" with this schema:\n${JSON.stringify(
      tool.function.parameters,
    )}`;
  }
  if (
    (request as { response_format?: { type?: string } }).response_format?.type === "json_object"
  ) {
    return "Return valid JSON only.";
  }
  return "";
}

// ─── Raw API calls ────────────────────────────────────────────────────────────

async function generateContent(args: {
  apiKey: string;
  model: string;
  request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
}): Promise<{
  text: string;
  usage: ChatUsage;
}> {
  const schemaInstructions = buildSchemaInstructions(args.request);
  const messages = args.request.messages as Array<{
    role: string;
    content: string | OpenAIContentPart[] | null | undefined;
  }>;

  // Build Google contents array, preserving image parts
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [
      ...(schemaInstructions && msg === messages[messages.length - 1]
        ? [{ text: schemaInstructions + "\n\n" }]
        : []),
      ...toGoogleParts(msg.content),
    ],
  }));

  // If there's a system message, prepend it as a user turn
  const systemMsg = messages.find((m) => m.role === "system");
  const contentToSend = systemMsg
    ? [
        {
          role: "user",
          parts: [
            {
              text: schemaInstructions
                ? schemaInstructions +
                  "\n\n" +
                  (typeof systemMsg.content === "string" ? systemMsg.content : "")
                : typeof systemMsg.content === "string"
                  ? systemMsg.content
                  : "",
            },
          ],
        },
        { role: "model", parts: [{ text: "Understood." }] },
        ...contents.filter((c) => {
          const orig = messages[contents.indexOf(c)];
          return orig?.role !== "system";
        }),
      ]
    : contents;

  const response = await fetch(`${apiBase(args.model)}:generateContent?key=${args.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: contentToSend,
      generationConfig: {
        temperature: (args.request as { temperature?: number }).temperature ?? 0.3,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google generateContent failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  return {
    text,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount,
      completion_tokens: data.usageMetadata?.candidatesTokenCount,
      total_tokens: data.usageMetadata?.totalTokenCount,
    },
  };
}

async function generateEmbeddings(args: {
  apiKey: string;
  model: string;
  input: string | string[];
}): Promise<EmbeddingsResult> {
  const values = Array.isArray(args.input) ? args.input : [args.input];
  const embeddings: number[][] = [];
  let promptTokens = 0;
  let totalTokens = 0;

  for (const value of values) {
    const response = await fetch(`${apiBase(args.model)}:embedContent?key=${args.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${args.model}`,
        content: { parts: [{ text: value }] },
        outputDimensionality: DEFAULT_EMBEDDING_DIMENSION,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Google embeddings failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    const data = (await response.json()) as {
      embedding?: { values?: number[] };
      usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number };
    };
    embeddings.push(data.embedding?.values ?? []);
    promptTokens += data.usageMetadata?.promptTokenCount ?? 0;
    totalTokens += data.usageMetadata?.totalTokenCount ?? data.usageMetadata?.promptTokenCount ?? 0;
  }

  return {
    embeddings,
    usage: {
      prompt_tokens: promptTokens || undefined,
      total_tokens: totalTokens || undefined,
    },
  };
}

// ─── Direct vision call (platform escape hatch) ───────────────────────────────

/**
 * Low-level Google API call for multipart content (images, PDFs).
 * Used by attachmentExtraction.ts for platform-level calls that bypass routing.
 * Accepts a raw Google API request body and returns the text response.
 */
export async function callGoogleVisionDirect(args: {
  apiKey: string;
  model: string;
  body: object;
}): Promise<string | undefined> {
  const response = await fetch(`${apiBase(args.model)}:generateContent?key=${args.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args.body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google vision request failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || undefined;
}

export function getPlatformGoogleApiKey(): string | null {
  return getPlatformApiKey();
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const googleAdapter: AiProviderAdapter = {
  provider: "google",

  hasPlatformCredentials() {
    return Boolean(getPlatformApiKey());
  },

  async chatCompletion({ route, request }) {
    const apiKey = route.apiKey ?? getPlatformApiKey();
    if (!apiKey) throw new Error("Google API key is not available for this route.");

    const { text, usage } = await generateContent({ apiKey, model: route.model, request });

    // Return OpenAI-shaped response so callers stay provider-agnostic
    const firstTool = request.tools?.[0];
    const toolName = firstTool && "function" in firstTool ? firstTool.function?.name : undefined;
    return {
      id: "google-" + Date.now(),
      object: "chat.completion" as const,
      created: Math.floor(Date.now() / 1000),
      model: route.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: toolName ? null : text,
            tool_calls: toolName
              ? [
                  {
                    id: "call_google",
                    type: "function" as const,
                    function: { name: toolName, arguments: text },
                  },
                ]
              : undefined,
            refusal: null,
          },
          finish_reason: "stop" as const,
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
      },
    } satisfies OpenAI.Chat.Completions.ChatCompletion;
  },

  async embedTexts({ route, input }) {
    const apiKey = route.apiKey ?? getPlatformApiKey();
    if (!apiKey) throw new Error("Google API key is not available for this route.");
    return generateEmbeddings({ apiKey, model: route.model, input });
  },

  // transcribeAudio not implemented — Google transcription not supported
};
