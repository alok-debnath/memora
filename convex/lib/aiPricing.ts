export type AiPricingOperation =
  | "chat_completion"
  | "embedding"
  | "transcription"
  | "image_generation";
export type AiBilledTo = "memora" | "user_byok";
export type AiPriceDisplayMode = "estimated" | "exact" | "unavailable";

export type AiModelPricingRow = {
  provider: string;
  model: string;
  operation: AiPricingOperation;
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  cachedInputUsdPer1M?: number;
  audioUsdPerMinute?: number;
  imageUsdPerUnit?: number;
  priceDisplayMode: AiPriceDisplayMode;
  pricingSource: string;
  effectiveFrom?: number;
  updatedAt: number;
};

const DEFAULT_PRICING_VERSION = "2026-04-13-defaults";

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

function microsFromUsd(amountUsd: number) {
  return Math.round(amountUsd * 1_000_000);
}

export function buildDefaultPricingCatalog(now = Date.now()): AiModelPricingRow[] {
  return [
    {
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      operation: "chat_completion",
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
      priceDisplayMode: "estimated",
      pricingSource: "openai_api_pricing",
      updatedAt: now,
    },
    {
      provider: "openai",
      model: "gpt-4o",
      operation: "chat_completion",
      inputUsdPer1M: 2.5,
      outputUsdPer1M: 10,
      priceDisplayMode: "estimated",
      pricingSource: "openai_api_pricing",
      updatedAt: now,
    },
    {
      provider: "openai",
      model: OPENAI_EMBEDDING_MODEL,
      operation: "embedding",
      inputUsdPer1M: 0.02,
      priceDisplayMode: "estimated",
      pricingSource: "openai_api_pricing",
      updatedAt: now,
    },
    {
      provider: "openai",
      model: OPENAI_TRANSCRIPTION_MODEL,
      operation: "transcription",
      audioUsdPerMinute: 0.003,
      priceDisplayMode: "estimated",
      pricingSource: "openai_api_pricing",
      updatedAt: now,
    },
    {
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
      operation: "image_generation",
      priceDisplayMode: "unavailable",
      pricingSource: "openai_api_pricing",
      updatedAt: now,
    },
    {
      provider: "google",
      model: GEMINI_TEXT_MODEL,
      operation: "chat_completion",
      inputUsdPer1M: 0.1,
      outputUsdPer1M: 0.4,
      priceDisplayMode: "estimated",
      pricingSource: "gemini_api_pricing",
      updatedAt: now,
    },
    {
      provider: "google",
      model: GEMINI_EMBEDDING_MODEL,
      operation: "embedding",
      inputUsdPer1M: 0.15,
      priceDisplayMode: "estimated",
      pricingSource: "gemini_api_pricing",
      updatedAt: now,
    },
  ];
}

export function getDefaultPricingEntry(
  provider: string,
  model: string,
  operation: AiPricingOperation,
): AiModelPricingRow | null {
  return (
    buildDefaultPricingCatalog(0).find(
      (entry) =>
        entry.provider === provider && entry.model === model && entry.operation === operation,
    ) ?? null
  );
}

export function resolveBilledTo(args: {
  credentialSource?: "platform" | "user_byok";
  billingOwner?: "platform" | "user";
}): AiBilledTo {
  return args.credentialSource === "user_byok" || args.billingOwner === "user"
    ? "user_byok"
    : "memora";
}

export function estimatePricingMicros(args: {
  pricing: Pick<
    AiModelPricingRow,
    | "inputUsdPer1M"
    | "outputUsdPer1M"
    | "audioUsdPerMinute"
    | "imageUsdPerUnit"
    | "priceDisplayMode"
  > | null;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  imageUnits?: number;
}) {
  if (!args.pricing || args.pricing.priceDisplayMode === "unavailable") {
    return {
      costUsdMicros: undefined,
      priceDisplayMode: "unavailable" as const,
      pricingReason: "pricing_unavailable",
    };
  }

  const inputCost =
    args.pricing.inputUsdPer1M && args.inputTokens
      ? microsFromUsd((args.inputTokens / 1_000_000) * args.pricing.inputUsdPer1M)
      : 0;
  const outputCost =
    args.pricing.outputUsdPer1M && args.outputTokens
      ? microsFromUsd((args.outputTokens / 1_000_000) * args.pricing.outputUsdPer1M)
      : 0;
  const audioCost =
    args.pricing.audioUsdPerMinute && args.audioSeconds
      ? microsFromUsd((args.audioSeconds / 60) * args.pricing.audioUsdPerMinute)
      : 0;
  const imageCost =
    args.pricing.imageUsdPerUnit && args.imageUnits
      ? microsFromUsd(args.imageUnits * args.pricing.imageUsdPerUnit)
      : 0;
  const total = inputCost + outputCost + audioCost + imageCost;

  if (total <= 0) {
    return {
      costUsdMicros: undefined,
      priceDisplayMode: "unavailable" as const,
      pricingReason: "usage_not_available",
    };
  }

  return {
    costUsdMicros: total,
    priceDisplayMode: args.pricing.priceDisplayMode,
    pricingReason: undefined,
  };
}

export const DEFAULT_AI_PRICING_VERSION = DEFAULT_PRICING_VERSION;
