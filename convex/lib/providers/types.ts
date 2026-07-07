import type OpenAI from "openai";
import type { AiProvider } from "../ai";

// ─── Route resolution ────────────────────────────────────────────────────────

export type ResolvedRoute = {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  credentialSource: "platform" | "user_byok";
  billingOwner: "platform" | "user";
  routingReason: string;
};

// ─── Shared response shapes ───────────────────────────────────────────────────

export type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type EmbeddingsResult = {
  embeddings: number[][];
  usage: ChatUsage;
};

// ─── Provider adapter interface ───────────────────────────────────────────────

/**
 * Every AI provider implements this interface.
 * Adding a new provider = create a new file in this directory + add to the
 * ADAPTERS registry in convex/lib/aiDispatch.ts.
 *
 * The request shape uses OpenAI types as the lingua franca.
 * Google and other non-OpenAI adapters translate internally.
 *
 * The `model` field is intentionally omitted from chatCompletion/embedTexts
 * requests — it is injected by the routing layer (route.model). Callers never
 * need to know or import a model constant.
 */
export interface AiProviderAdapter {
  readonly provider: AiProvider;

  /** True when Memora's own (platform) credentials are available for this provider. */
  hasPlatformCredentials(): boolean;

  /**
   * Chat / structured-text / vision completion.
   * model is omitted — the dispatch layer injects route.model before calling.
   */
  chatCompletion(args: {
    route: ResolvedRoute;
    request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
  }): Promise<OpenAI.Chat.Completions.ChatCompletion>;

  /**
   * Streaming chat completion — optional. Emits text deltas via `onDelta`
   * while the response generates, then resolves with the fully assembled
   * completion (including usage when the provider reports it). Providers
   * without streaming support simply omit this; the dispatch layer falls
   * back to `chatCompletion` transparently.
   */
  chatCompletionStream?(args: {
    route: ResolvedRoute;
    request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
    onDelta: (textDelta: string) => void;
    /**
     * When the visible reply text is a field inside a forced tool call's
     * streaming arguments (structured-answer pattern) rather than plain
     * message content, name the tool + argument here so the adapter can
     * extract and forward it through `onDelta` as it streams in.
     */
    streamToolTextField?: { toolName: string; argName: string };
  }): Promise<OpenAI.Chat.Completions.ChatCompletion>;

  /** Text embeddings. */
  embedTexts(args: { route: ResolvedRoute; input: string | string[] }): Promise<EmbeddingsResult>;

  /**
   * Audio transcription — optional, only implement for providers that support it.
   * The dispatch layer throws before calling this if the adapter doesn't implement it.
   */
  transcribeAudio?(args: {
    route: ResolvedRoute;
    audioBase64: string;
    format: string;
    language?: string;
  }): Promise<{ text?: string | null }>;
}
