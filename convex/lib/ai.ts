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

export const USER_VISIBLE_AI_CAPABILITIES = [
  "chat",
  "structured_text",
  "embeddings",
  "vision",
  "transcription",
] as const;
export type UserVisibleAiCapability = (typeof USER_VISIBLE_AI_CAPABILITIES)[number];

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
export type AiProviderModelSelections = Partial<
  Record<AiProvider, Partial<Record<AiCapability, string>>>
>;
export type EmbeddingRebuildStatus =
  | "idle"
  | "queued"
  | "reembedding_memories"
  | "rebuilding_topics"
  | "failed";

export const EMBEDDING_VECTOR_DIMENSION = 1536;
export const ACTIVE_EMBEDDING_REBUILD_STATUSES: EmbeddingRebuildStatus[] = [
  "queued",
  "reembedding_memories",
  "rebuilding_topics",
];

export type AiProviderModel = {
  id: string;
  label: string;
  capabilities: AiCapability[];
};

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

export const PROVIDER_MODELS: Record<AiProvider, AiProviderModel[]> = {
  openai: [
    {
      id: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      label: "OpenAI Chat Default",
      capabilities: ["chat", "structured_text"],
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      label: "OpenAI Embeddings Default",
      capabilities: ["embeddings"],
    },
    {
      id: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
      label: "OpenAI Transcription Default",
      capabilities: ["transcription"],
    },
    {
      id: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      label: "OpenAI Image Default",
      capabilities: ["image_generation"],
    },
  ],
  google: [
    {
      id: process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash",
      label: "Gemini Text Default",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
      label: "Gemini Embeddings Default",
      capabilities: ["embeddings"],
    },
  ],
};

export const PROVIDER_DEFAULT_MODELS: Record<AiProvider, Partial<Record<AiCapability, string>>> = {
  openai: {
    chat: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
    structured_text: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
    embeddings: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    vision: "gpt-4o",
    transcription: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
    image_generation: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  },
  google: {
    chat: process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash",
    structured_text: process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash",
    embeddings: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
    vision: process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash",
  },
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
  return PROVIDER_MODELS[provider].some((model) => model.capabilities.includes(capability));
}

export function supportsProviderModelCapability(
  provider: AiProvider,
  modelId: string,
  capability: AiCapability,
) {
  return PROVIDER_MODELS[provider].some(
    (model) => model.id === modelId && model.capabilities.includes(capability),
  );
}

export function supportsFeature(provider: AiProvider, feature: AiFeature, modelId?: string) {
  const capability = FEATURE_TO_CAPABILITY[feature];
  return modelId
    ? supportsProviderModelCapability(provider, modelId, capability)
    : supportsCapability(provider, capability);
}

export function getProviderDefaultModel(provider: AiProvider, capability: AiCapability) {
  return PROVIDER_DEFAULT_MODELS[provider][capability] ?? null;
}

export function getProviderModels(provider: AiProvider) {
  return PROVIDER_MODELS[provider];
}

export function normalizeProviderModelSelections(args: {
  preferredProvider: AiProvider;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
}) {
  const normalizedSelections: AiProviderModelSelections = {
    ...(args.providerModels ?? {}),
  };
  if (args.capabilityModels && Object.keys(args.capabilityModels).length > 0) {
    normalizedSelections[args.preferredProvider] = {
      ...(normalizedSelections[args.preferredProvider] ?? {}),
      ...args.capabilityModels,
    };
  }
  return normalizedSelections;
}

export function getSelectedProviderModel(args: {
  provider: AiProvider;
  capability: AiCapability;
  preferredProvider: AiProvider;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
}) {
  const normalizedSelections = normalizeProviderModelSelections(args);
  return (
    normalizedSelections[args.provider]?.[args.capability] ??
    getProviderDefaultModel(args.provider, args.capability)
  );
}

export function buildEmbeddingFingerprint(provider: AiProvider, model: string) {
  return `${provider}:${model}:${EMBEDDING_VECTOR_DIMENSION}`;
}

export function isEmbeddingRebuildActive(status?: EmbeddingRebuildStatus | null) {
  return Boolean(
    status && ACTIVE_EMBEDDING_REBUILD_STATUSES.includes(status as EmbeddingRebuildStatus),
  );
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}
