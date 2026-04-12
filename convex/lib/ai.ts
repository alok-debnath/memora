export const AI_PROVIDERS = ["openai", "google"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_CAPABILITIES = [
  "chat",
  "structured_text",
  "embeddings",
  "vision",
  "transcription",
  "image_generation",
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export type AiFeature =
  | "memory_chat"
  | "memory_search"
  | "memory_processing"
  | "memory_capture"
  | "diary_processing"
  | "topic_management"
  | "conflict_detection"
  | "attachment_extraction"
  | "audio_transcription";

export type AiCredentialSource = "platform" | "user_byok";
export type AiBillingOwner = "platform" | "user";
export type AiVisibility = "user_visible" | "background";

export const FEATURE_TO_CAPABILITY: Record<AiFeature, AiCapability> = {
  memory_chat: "chat",
  memory_search: "embeddings",
  memory_processing: "structured_text",
  memory_capture: "structured_text",
  diary_processing: "structured_text",
  topic_management: "structured_text",
  conflict_detection: "structured_text",
  attachment_extraction: "vision",
  audio_transcription: "transcription",
};

export const PROVIDER_CAPABILITIES: Record<AiProvider, AiCapability[]> = {
  openai: ["chat", "structured_text", "embeddings", "vision", "transcription", "image_generation"],
  google: ["structured_text", "embeddings", "vision", "image_generation"],
};

export const DEFAULT_ROUTING: Record<
  AiCapability,
  { provider: AiProvider; model: string; enabled: boolean }
> = {
  chat: {
    provider: "openai",
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
    enabled: true,
  },
  structured_text: {
    provider: "openai",
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
    enabled: true,
  },
  embeddings: {
    provider: "openai",
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    enabled: true,
  },
  vision: {
    provider: "google",
    model: process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash",
    enabled: true,
  },
  transcription: {
    provider: "openai",
    model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
    enabled: true,
  },
  image_generation: {
    provider: "openai",
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    enabled: true,
  },
};

export function supportsCapability(provider: AiProvider, capability: AiCapability) {
  return PROVIDER_CAPABILITIES[provider].includes(capability);
}

export function supportsFeature(provider: AiProvider, feature: AiFeature) {
  if (feature === "memory_chat") {
    return provider === "openai";
  }
  if (feature === "audio_transcription") {
    return provider === "openai";
  }
  return supportsCapability(provider, FEATURE_TO_CAPABILITY[feature]);
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}
