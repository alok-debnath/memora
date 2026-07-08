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

const GOOGLE_FETCH_TIMEOUT_MS = 60_000;

/** POST JSON to a Google API endpoint, throwing with a truncated response body on non-2xx. */
async function googleFetchJson<T>(url: string, apiKey: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    // isRetryableAiError (aiDispatch.ts) checks error.status — a plain
    // Error with the code baked into the message string doesn't match, so
    // Google 429/5xx never hit the shared retry-with-backoff path that
    // OpenAI errors already benefit from. Attach status explicitly.
    throw Object.assign(
      new Error(
        `Google API request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ""}`,
      ),
      { status: response.status },
    );
  }
  return response.json() as Promise<T>;
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

/** Strips JSON-schema keys Gemini's function-declaration schema doesn't accept (e.g. additionalProperties). */
function sanitizeGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === "additionalProperties") continue;
      out[key] = sanitizeGeminiSchema(value);
    }
    return out;
  }
  return schema;
}

/** Translates OpenAI-shaped tool definitions into Gemini's functionDeclarations format. */
function toGeminiTools(
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
): Array<Record<string, unknown>> | undefined {
  const declarations = (tools ?? [])
    .filter((tool) => tool.type === "function")
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: sanitizeGeminiSchema(tool.function.parameters),
    }));
  return declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined;
}

/** Translates OpenAI's tool_choice into Gemini's toolConfig.functionCallingConfig — the direct
 * equivalent of the forced-tool-call pattern the chat loop relies on (see memoryChat.ts). */
function toGeminiToolConfig(
  toolChoice: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["tool_choice"],
): Record<string, unknown> | undefined {
  if (!toolChoice || toolChoice === "auto") {
    return { functionCallingConfig: { mode: "AUTO" } };
  }
  if (toolChoice === "none") {
    return { functionCallingConfig: { mode: "NONE" } };
  }
  if (toolChoice === "required") {
    return { functionCallingConfig: { mode: "ANY" } };
  }
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: [toolChoice.function.name] },
    };
  }
  return undefined;
}

type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * Translates the OpenAI-shaped conversation into Gemini's contents array.
 * System messages fold into a single systemInstruction block (Gemini has no
 * scattered system-turn concept). Assistant tool_calls become `functionCall`
 * parts and tool-role results become `functionResponse` parts keyed by name
 * (matched via tool_call_id -> name, since Gemini has no call-id concept) —
 * without this translation Gemini never sees which tool ran or what it
 * returned, which silently breaks the multi-step tool loop.
 */
function toGeminiContents(messages: OpenAIMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<Record<string, unknown>>;
} {
  const systemTexts: string[] = [];
  const contents: Array<Record<string, unknown>> = [];
  const toolCallNameById = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") {
      if (typeof msg.content === "string" && msg.content) systemTexts.push(msg.content);
      continue;
    }

    if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: toGoogleParts(msg.content as string | OpenAIContentPart[] | null | undefined),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (typeof msg.content === "string" && msg.content) parts.push({ text: msg.content });
      for (const call of msg.tool_calls ?? []) {
        if (call.type !== "function") continue;
        toolCallNameById.set(call.id, call.function.name);
        let callArgs: unknown = {};
        try {
          callArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          callArgs = {};
        }
        parts.push({ functionCall: { name: call.function.name, args: callArgs } });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "tool") {
      const name = toolCallNameById.get(msg.tool_call_id) ?? "unknown_tool";
      let response: unknown = { result: msg.content };
      if (typeof msg.content === "string") {
        try {
          response = JSON.parse(msg.content);
        } catch {
          response = { result: msg.content };
        }
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
    }
  }

  return {
    systemInstruction:
      systemTexts.length > 0 ? { parts: [{ text: systemTexts.join("\n\n") }] } : undefined,
    contents,
  };
}

/** Maps Gemini's finishReason/blockReason to the OpenAI-shaped finish_reason union. */
function toGoogleFinishReason(
  reason: string | undefined,
  hasToolCalls: boolean,
): "stop" | "length" | "tool_calls" | "content_filter" {
  if (hasToolCalls) return "tool_calls";
  switch (reason) {
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content_filter";
    default:
      return "stop";
  }
}

// ─── Raw API calls ────────────────────────────────────────────────────────────

async function generateContent(args: {
  apiKey: string;
  model: string;
  request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
}): Promise<{
  text: string;
  toolCalls: Array<{ name: string; argumentsJson: string }>;
  usage: ChatUsage;
  finishReason?: string;
}> {
  const messages = args.request.messages as OpenAIMessage[];
  const { systemInstruction, contents } = toGeminiContents(messages);
  const tools = toGeminiTools(args.request.tools as OpenAI.Chat.Completions.ChatCompletionTool[]);
  const toolConfig = tools ? toGeminiToolConfig(args.request.tool_choice) : undefined;
  // Some callers (manageTopics.ts, attachmentExtraction.ts) still pass the
  // legacy max_tokens field rather than max_completion_tokens — read either
  // so the cap isn't silently dropped only on the Google adapter.
  const maxOutputTokens =
    args.request.max_completion_tokens ?? (args.request as { max_tokens?: number }).max_tokens;
  const responseFormat = (args.request as { response_format?: { type?: string } }).response_format;

  const data = await googleFetchJson<{
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }>;
      };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  }>(`${apiBase(args.model)}:generateContent`, args.apiKey, {
    ...(systemInstruction ? { systemInstruction } : {}),
    contents,
    ...(tools ? { tools } : {}),
    ...(toolConfig ? { toolConfig } : {}),
    generationConfig: {
      temperature: (args.request as { temperature?: number }).temperature ?? 0.3,
      ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
      // Without this, structured_text callers expecting JSON (detectConflicts,
      // manageTopics) get prose back from Gemini and safeJsonParse silently
      // returns null — the feature no-ops with no visible error.
      ...(responseFormat?.type === "json_object" ? { responseMimeType: "application/json" } : {}),
    },
  });

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const toolCalls = parts
    .filter((p): p is { functionCall: { name: string; args?: unknown } } => Boolean(p.functionCall))
    .map((p) => ({
      name: p.functionCall.name,
      argumentsJson: JSON.stringify(p.functionCall.args ?? {}),
    }));

  return {
    text,
    toolCalls,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount,
      completion_tokens: data.usageMetadata?.candidatesTokenCount,
      total_tokens: data.usageMetadata?.totalTokenCount,
    },
    finishReason: candidate?.finishReason ?? data.promptFeedback?.blockReason,
  };
}

async function generateEmbeddings(args: {
  apiKey: string;
  model: string;
  input: string | string[];
}): Promise<EmbeddingsResult> {
  const values = Array.isArray(args.input) ? args.input : [args.input];

  // Single batch request instead of one round trip per string — Gemini's
  // batchEmbedContents accepts up to 100 requests per call.
  const data = await googleFetchJson<{
    embeddings?: Array<{ values?: number[] }>;
  }>(`${apiBase(args.model)}:batchEmbedContents`, args.apiKey, {
    requests: values.map((value) => ({
      model: `models/${args.model}`,
      content: { parts: [{ text: value }] },
      outputDimensionality: DEFAULT_EMBEDDING_DIMENSION,
    })),
  });

  const embeddings = (data.embeddings ?? []).map((e) => e.values ?? []);
  // A count mismatch or an empty vector means an entry silently maps to
  // the wrong index (or a zero-vector) when the caller (backfillEmbeddings)
  // writes results back by position — fail loudly instead of corrupting
  // the vector index.
  if (embeddings.length !== values.length || embeddings.some((vector) => vector.length === 0)) {
    throw new Error(
      `Google batchEmbedContents returned ${embeddings.length} embeddings for ${values.length} inputs, or an empty vector.`,
    );
  }
  // batchEmbedContents does not return usageMetadata — estimate input
  // tokens (roughly 4 chars/token) so Google embedding cost isn't silently
  // recorded as $0/unavailable in analytics.
  const estimatedInputTokens = Math.ceil(values.reduce((sum, value) => sum + value.length, 0) / 4);
  return {
    embeddings,
    usage: { prompt_tokens: estimatedInputTokens, total_tokens: estimatedInputTokens },
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
  const data = await googleFetchJson<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  }>(`${apiBase(args.model)}:generateContent`, args.apiKey, args.body);

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

    const { text, toolCalls, usage, finishReason } = await generateContent({
      apiKey,
      model: route.model,
      request,
    });

    // Return OpenAI-shaped response so callers stay provider-agnostic
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
            content: toolCalls.length > 0 ? null : text,
            tool_calls:
              toolCalls.length > 0
                ? toolCalls.map((call, index) => ({
                    id: `call_google_${index}`,
                    type: "function" as const,
                    function: { name: call.name, arguments: call.argumentsJson },
                  }))
                : undefined,
            refusal: null,
          },
          // Hardcoding "stop" hid MAX_TOKENS truncation and safety-blocked
          // empty candidates as ordinary success — the caller (memoryChat.ts)
          // then ends the turn silently with an empty reply. Map the real
          // reason through so a future caller can branch on it.
          finish_reason: toGoogleFinishReason(finishReason, toolCalls.length > 0),
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
