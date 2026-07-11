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
  "idle" | "queued" | "reembedding_memories" | "rebuilding_topics" | "failed";

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
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      capabilities: ["chat", "structured_text"],
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 mini",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "text-embedding-3-small",
      label: "text-embedding-3-small",
      capabilities: ["embeddings"],
    },
    {
      id: "text-embedding-3-large",
      label: "text-embedding-3-large",
      capabilities: ["embeddings"],
    },
    {
      id: "gpt-4o-mini-transcribe",
      label: "GPT-4o mini Transcribe",
      capabilities: ["transcription"],
    },
    {
      id: "gpt-4o-transcribe",
      label: "GPT-4o Transcribe",
      capabilities: ["transcription"],
    },
    {
      id: "gpt-image-1",
      label: "GPT Image 1",
      capabilities: ["image_generation"],
    },
  ],
  google: [
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "gemini-2.5-flash-preview-04-17",
      label: "Gemini 2.5 Flash Preview",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "gemini-2.5-pro-preview-05-06",
      label: "Gemini 2.5 Pro Preview",
      capabilities: ["chat", "structured_text", "vision"],
    },
    {
      id: "gemini-embedding-001",
      label: "Gemini Embedding 001",
      capabilities: ["embeddings"],
    },
    // "gemini-text-embedding-004" removed: wrong API id (the real Google
    // model is "text-embedding-004", not "gemini-text-embedding-004"), and
    // it natively emits 768-dim vectors that don't support the
    // outputDimensionality:1536 reduction the vector index requires —
    // selecting it broke embed/search outright.
  ],
};

export const PROVIDER_DEFAULT_MODELS: Record<AiProvider, Partial<Record<AiCapability, string>>> = {
  openai: {
    chat: "gpt-4o-mini",
    structured_text: "gpt-4o-mini",
    embeddings: "text-embedding-3-small",
    vision: "gpt-4o",
    transcription: "gpt-4o-transcribe",
    image_generation: "gpt-image-1",
  },
  google: {
    chat: "gemini-2.0-flash",
    structured_text: "gemini-2.0-flash",
    embeddings: "gemini-embedding-001",
    vision: "gemini-2.0-flash",
  },
};

export type AiRoutingEntry = {
  provider: AiProvider;
  model: string;
  enabled: boolean;
  fallbackProvider?: AiProvider;
  fallbackModel?: string;
  fallbackEnabled?: boolean;
};

/**
 * Seed defaults written to `aiRoutingConfig` on first deploy via `seedRoutingConfig`.
 * At runtime the routing system reads exclusively from the DB — this constant is only
 * used as a bootstrap fallback if the DB has not been seeded yet, and to populate the
 * seed mutation. No env vars — all values are explicit and admin-changeable.
 */
export const DEFAULT_ROUTING: Record<AiCapability, AiRoutingEntry> = {
  chat: {
    provider: "openai",
    model: "gpt-4o-mini",
    enabled: true,
    fallbackProvider: "google",
    fallbackModel: "gemini-2.0-flash",
    fallbackEnabled: true,
  },
  structured_text: {
    provider: "openai",
    model: "gpt-4o-mini",
    enabled: true,
    fallbackProvider: "google",
    fallbackModel: "gemini-2.0-flash",
    fallbackEnabled: true,
  },
  embeddings: {
    provider: "openai",
    model: "text-embedding-3-small",
    enabled: true,
    fallbackProvider: "google",
    fallbackModel: "gemini-embedding-001",
    fallbackEnabled: true,
  },
  vision: {
    provider: "openai",
    model: "gpt-4o",
    enabled: true,
    fallbackProvider: "google",
    fallbackModel: "gemini-2.0-flash",
    fallbackEnabled: true,
  },
  transcription: {
    provider: "openai",
    model: "gpt-4o-transcribe",
    enabled: true,
    // Google does not support transcription
  },
  image_generation: {
    provider: "openai",
    model: "gpt-image-1",
    enabled: true,
    // Google does not support image_generation
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
