import React from "react";
import { StyleSheet, ActivityIndicator, Alert, Platform, ScrollView } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAppTheme } from "@/hooks/useAppTheme";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Badge } from "@/components/ui/Badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { useAppToast } from "@/components/ui/toast";
import { withAlpha } from "@/components/ui/themeHelpers";
import { navigationAccentColors } from "@/constants/colors";

// ─── Shared helpers ───────────────────────────────────────────────────────────

const ACCENT = navigationAccentColors.admin; // rose #E11D48
const ANALYTICS_ACCENT = "#6366F1"; // indigo for analytics section

function formatCompact(n: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

function formatUsd(micros: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: micros >= 100_000 ? 2 : 4,
  }).format(micros / 1_000_000);
}

// ─── Section Tab Bar ─────────────────────────────────────────────────────────

type AdminSection = "analytics" | "routing";

const SECTIONS: {
  id: AdminSection;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
}[] = [
  { id: "analytics", label: "System Analytics", icon: "trending-up", accent: ANALYTICS_ACCENT },
  { id: "routing", label: "AI Routing", icon: "sliders", accent: ACCENT },
];

function SectionTabBar({
  active,
  onChange,
  theme,
}: {
  active: AdminSection;
  onChange: (s: AdminSection) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <XStack
      borderRadius={18}
      backgroundColor={theme.secondary.val}
      borderWidth={1}
      borderColor={theme.borderColor.val}
      padding={4}
      gap={4}
    >
      {SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <PressableScale
            key={s.id}
            onPress={() => onChange(s.id)}
            style={{ flex: 1, borderRadius: 14 }}
          >
            <YStack
              flex={1}
              paddingVertical={10}
              paddingHorizontal={8}
              borderRadius={14}
              alignItems="center"
              justifyContent="center"
              gap={4}
              backgroundColor={isActive ? s.accent + "18" : "transparent"}
              borderWidth={isActive ? 1 : 0}
              borderColor={isActive ? s.accent + "60" : "transparent"}
            >
              <Feather name={s.icon} size={16} color={isActive ? s.accent : theme.colorMuted.val} />
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight={isActive ? "700" : "500"}
                color={isActive ? s.accent : theme.colorMuted.val}
                textAlign="center"
              >
                {s.label}
              </Text>
            </YStack>
          </PressableScale>
        );
      })}
    </XStack>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

type RangeKey = "7d" | "30d" | "90d" | "365d";
const RANGE_OPTS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "365d", label: "1Y" },
];

function RangePill({
  active,
  value,
  label,
  onPress,
  theme,
}: {
  active: boolean;
  value: string;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <PressableScale onPress={onPress} style={{ borderRadius: 10 }}>
      <YStack
        paddingHorizontal={14}
        paddingVertical={6}
        borderRadius={10}
        backgroundColor={active ? ANALYTICS_ACCENT : theme.secondary.val}
        borderWidth={1}
        borderColor={active ? ANALYTICS_ACCENT : theme.borderColor.val}
      >
        <Text
          fontSize={12}
          fontFamily="$body"
          fontWeight="700"
          color={active ? "#fff" : theme.colorMuted.val}
        >
          {label}
        </Text>
      </YStack>
    </PressableScale>
  );
}

/** A metric card for displaying a single KPI with icon */
function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <SurfaceCard padding={16} style={{ flex: 1, minWidth: 148, borderRadius: 20 }}>
      <YStack
        width={38}
        height={38}
        borderRadius={12}
        backgroundColor={accent + "18"}
        alignItems="center"
        justifyContent="center"
        marginBottom={10}
      >
        <Feather name={icon} size={17} color={accent} />
      </YStack>
      <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color" numberOfLines={1}>
        {value}
      </Text>
      <Text fontSize={12} fontFamily="$body" color="$colorMuted" marginTop={2}>
        {label}
      </Text>
      {sub ? (
        <Text fontSize={11} fontFamily="$body" color="$colorMuted" marginTop={1} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

/** A split-cost row (Memora vs BYOK) */
function CostSplitRow({
  memoraCost,
  byokCost,
  totalCost,
  theme,
}: {
  memoraCost: number;
  byokCost: number;
  totalCost: number;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const memoraPct = totalCost > 0 ? (memoraCost / totalCost) * 100 : 0;
  const byokPct = totalCost > 0 ? (byokCost / totalCost) * 100 : 0;

  return (
    <YStack gap={8}>
      <XStack alignItems="center" justifyContent="space-between">
        <Text
          fontSize={11}
          fontFamily="$body"
          fontWeight="700"
          color={theme.colorMuted.val}
          textTransform="uppercase"
          letterSpacing={0.8}
        >
          Cost split
        </Text>
        <Text fontSize={12} fontFamily="$body" fontWeight="700" color="$color">
          {formatUsd(totalCost)}
        </Text>
      </XStack>
      {/* progress bar */}
      <YStack height={8} borderRadius={999} backgroundColor={theme.secondary.val} overflow="hidden">
        <XStack flex={1} height="100%">
          <YStack flex={memoraPct} backgroundColor={ACCENT} borderRadius={999} />
          <YStack flex={byokPct} backgroundColor={ANALYTICS_ACCENT} borderRadius={999} />
        </XStack>
      </YStack>
      <XStack gap={10} flexWrap="wrap">
        <XStack alignItems="center" gap={6}>
          <YStack width={10} height={10} borderRadius={3} backgroundColor={ACCENT} />
          <Text fontSize={12} fontFamily="$body" color="$colorMuted">
            Memora {formatUsd(memoraCost)} ({memoraPct.toFixed(0)}%)
          </Text>
        </XStack>
        <XStack alignItems="center" gap={6}>
          <YStack width={10} height={10} borderRadius={3} backgroundColor={ANALYTICS_ACCENT} />
          <Text fontSize={12} fontFamily="$body" color="$colorMuted">
            BYOK {formatUsd(byokCost)} ({byokPct.toFixed(0)}%)
          </Text>
        </XStack>
      </XStack>
    </YStack>
  );
}

function AnalyticsSection({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  const [range, setRange] = React.useState<RangeKey>("30d");

  const stats = useQuery(api.analytics.adminSystemOverview, { range });
  const isLoading = stats === undefined;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ gap: 14 }}>
      {/* Hero card */}
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
          <YStack flex={1} gap={6}>
            <Badge label="Platform Analytics" color={ANALYTICS_ACCENT} />
            <Text
              fontSize={22}
              lineHeight={26}
              fontFamily="$heading"
              fontWeight="700"
              color="$color"
            >
              System Overview
            </Text>
            <Text fontSize={13} lineHeight={19} fontFamily="$body" color="$colorMuted">
              Aggregated across all active users — content volume, AI spend, and engagement metrics.
            </Text>
          </YStack>
          <YStack
            width={48}
            height={48}
            borderRadius={16}
            alignItems="center"
            justifyContent="center"
            backgroundColor={ANALYTICS_ACCENT + "18"}
          >
            <Feather name="trending-up" size={20} color={ANALYTICS_ACCENT} />
          </YStack>
        </XStack>

        {/* Range selector */}
        <XStack gap={8} marginTop={14} flexWrap="wrap">
          {RANGE_OPTS.map((opt) => (
            <RangePill
              key={opt.value}
              active={range === opt.value}
              value={opt.value}
              label={opt.label}
              onPress={() => setRange(opt.value)}
              theme={theme}
            />
          ))}
          {stats && (
            <Badge label={`${stats.activeUsersInRange} active in range`} color={ANALYTICS_ACCENT} />
          )}
        </XStack>
      </Card>

      {isLoading ? (
        <YStack alignItems="center" paddingVertical={40}>
          <ActivityIndicator color={ANALYTICS_ACCENT} />
        </YStack>
      ) : (
        <>
          {/* ── Users ──────────────────────────────────────────────────────── */}
          <SectionLabel>Users</SectionLabel>
          <XStack gap={10} flexWrap="wrap">
            <MetricCard
              icon="users"
              label="Total users"
              value={formatCompact(stats.totalUsers)}
              sub={`${stats.byokUserCount} using BYOK`}
              accent={ANALYTICS_ACCENT}
            />
            <MetricCard
              icon="user-check"
              label="Active in range"
              value={formatCompact(stats.activeUsersInRange)}
              sub={`of ${stats.totalUsers} total`}
              accent={ANALYTICS_ACCENT}
            />
          </XStack>

          {/* ── Content ────────────────────────────────────────────────────── */}
          <SectionLabel marginBottom={4}>Content</SectionLabel>
          <XStack gap={10} flexWrap="wrap">
            <MetricCard
              icon="book-open"
              label="Total memories"
              value={formatCompact(stats.totalMemories)}
              accent={ANALYTICS_ACCENT}
            />
            <MetricCard
              icon="bell"
              label="Reminders"
              value={formatCompact(stats.totalReminders)}
              accent={ANALYTICS_ACCENT}
            />
            <MetricCard
              icon="edit-3"
              label="Diary entries"
              value={formatCompact(stats.totalDiaryEntries)}
              accent={ANALYTICS_ACCENT}
            />
            <MetricCard
              icon="message-circle"
              label="Chat messages"
              value={formatCompact(stats.totalChatMessages)}
              accent={ANALYTICS_ACCENT}
            />
            <MetricCard
              icon="paperclip"
              label="Attachments"
              value={formatCompact(stats.totalAttachmentUploads)}
              accent={ANALYTICS_ACCENT}
            />
          </XStack>

          {/* ── AI – range ─────────────────────────────────────────────────── */}
          <SectionLabel marginBottom={4}>{`AI Usage (${range.toUpperCase()})`}</SectionLabel>
          <XStack gap={10} flexWrap="wrap">
            <MetricCard
              icon="cpu"
              label="AI backend ops"
              value={formatCompact(stats.rangeAiRequests)}
              accent={ACCENT}
            />
            <MetricCard
              icon="search"
              label="Searches"
              value={formatCompact(stats.rangeSearches)}
              sub={`${formatCompact(stats.rangeDeepSearches)} deep`}
              accent={ACCENT}
            />
          </XStack>

          {/* Cost split card */}
          <SurfaceCard padding={16} style={{ borderRadius: 20 }}>
            <CostSplitRow
              memoraCost={stats.rangeMemoraAiCostUsdMicros}
              byokCost={stats.rangeByokAiCostUsdMicros}
              totalCost={stats.rangeAiCostUsdMicros}
              theme={theme}
            />
          </SurfaceCard>

          {/* ── AI – all time ──────────────────────────────────────────────── */}
          <SectionLabel marginBottom={4}>AI Usage (All Time)</SectionLabel>
          <XStack gap={10} flexWrap="wrap">
            <MetricCard
              icon="layers"
              label="Total AI requests"
              value={formatCompact(stats.allTimeAiRequests)}
              accent="#10B981"
            />
            <MetricCard
              icon="arrow-up"
              label="Input tokens"
              value={formatCompact(stats.allTimeAiInputTokens)}
              accent="#10B981"
            />
            <MetricCard
              icon="arrow-down"
              label="Output tokens"
              value={formatCompact(stats.allTimeAiOutputTokens)}
              accent="#10B981"
            />
            <MetricCard
              icon="search"
              label="Total searches"
              value={formatCompact(stats.allTimeSearches)}
              accent="#10B981"
            />
          </XStack>

          {/* All-time cost split */}
          <SurfaceCard padding={16} style={{ borderRadius: 20 }}>
            <CostSplitRow
              memoraCost={stats.allTimeMemoraAiCostUsdMicros}
              byokCost={stats.allTimeByokAiCostUsdMicros}
              totalCost={stats.allTimeAiCostUsdMicros}
              theme={theme}
            />
          </SurfaceCard>
        </>
      )}
    </Animated.View>
  );
}

// ─── AI Routing Section ───────────────────────────────────────────────────────

type AiCapability = "chat" | "structured_text" | "embeddings" | "vision" | "transcription";
type AiProvider = "openai" | "google";

interface RoutingRow {
  capability: AiCapability;
  provider: AiProvider;
  model: string;
  enabled: boolean;
  fallbackProvider?: AiProvider;
  fallbackModel?: string;
  fallbackEnabled?: boolean;
  supportedProviders: AiProvider[];
}

const CAPABILITY_META: Record<
  AiCapability,
  { label: string; icon: keyof typeof Feather.glyphMap; description: string }
> = {
  chat: {
    label: "Chat",
    icon: "message-circle",
    description: "AI assistant conversations and Q&A",
  },
  structured_text: {
    label: "Structured Text",
    icon: "file-text",
    description: "Memory processing, tagging, and parsing",
  },
  embeddings: {
    label: "Embeddings",
    icon: "layers",
    description: "Semantic vector search and similarity",
  },
  vision: {
    label: "Vision",
    icon: "image",
    description: "Image and attachment content extraction",
  },
  transcription: { label: "Transcription", icon: "mic", description: "Audio-to-text conversion" },
};

const OPENAI_MODELS: Record<AiCapability, string[]> = {
  chat: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  structured_text: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  embeddings: ["text-embedding-3-small", "text-embedding-3-large"],
  vision: ["gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  transcription: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe"],
};

const GOOGLE_MODELS: Record<AiCapability, string[]> = {
  chat: ["gemini-2.0-flash", "gemini-2.5-flash-preview-04-17", "gemini-2.5-pro-preview-05-06"],
  structured_text: [
    "gemini-2.0-flash",
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-pro-preview-05-06",
  ],
  embeddings: ["gemini-embedding-001", "gemini-text-embedding-004"],
  vision: ["gemini-2.0-flash", "gemini-2.5-flash-preview-04-17", "gemini-2.5-pro-preview-05-06"],
  transcription: [],
};

function getAvailableModels(provider: AiProvider, capability: AiCapability): string[] {
  if (provider === "openai") return OPENAI_MODELS[capability] ?? [];
  return GOOGLE_MODELS[capability] ?? [];
}

function ProviderChip({
  provider,
  selected,
  onPress,
  theme,
}: {
  provider: AiProvider;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <PressableScale onPress={onPress} style={{ borderRadius: 10 }}>
      <YStack
        paddingHorizontal={12}
        paddingVertical={6}
        borderRadius={10}
        backgroundColor={selected ? ACCENT : theme.secondary.val}
        borderWidth={1}
        borderColor={selected ? ACCENT : theme.borderColor.val}
      >
        <Text
          fontSize={12}
          fontFamily="$body"
          fontWeight="600"
          color={selected ? "#fff" : theme.colorMuted.val}
        >
          {provider === "openai" ? "OpenAI" : "Google"}
        </Text>
      </YStack>
    </PressableScale>
  );
}

function ModelChip({
  model,
  selected,
  onPress,
  theme,
}: {
  model: string;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <PressableScale onPress={onPress} style={{ borderRadius: 8 }}>
      <YStack
        paddingHorizontal={10}
        paddingVertical={5}
        borderRadius={8}
        backgroundColor={selected ? ACCENT + "18" : theme.secondary.val}
        borderWidth={1}
        borderColor={selected ? ACCENT : theme.borderColor.val}
      >
        <Text
          fontSize={11}
          fontFamily="$body"
          fontWeight={selected ? "700" : "400"}
          color={selected ? ACCENT : theme.colorMuted.val}
          numberOfLines={1}
        >
          {model}
        </Text>
      </YStack>
    </PressableScale>
  );
}

function RoutingCard({
  row,
  index,
  onSave,
}: {
  row: RoutingRow;
  index: number;
  onSave: (patch: {
    capability: AiCapability;
    provider: AiProvider;
    model: string;
    enabled: boolean;
    fallbackProvider?: AiProvider;
    fallbackModel?: string;
    fallbackEnabled?: boolean;
  }) => Promise<void>;
}) {
  const theme = useAppTheme();
  const meta = CAPABILITY_META[row.capability];

  const [primaryProvider, setPrimaryProvider] = React.useState<AiProvider>(row.provider);
  const [primaryModel, setPrimaryModel] = React.useState(row.model);
  const [fallbackProvider, setFallbackProvider] = React.useState<AiProvider | undefined>(
    row.fallbackProvider,
  );
  const [fallbackModel, setFallbackModel] = React.useState(row.fallbackModel ?? "");
  const [fallbackEnabled, setFallbackEnabled] = React.useState(row.fallbackEnabled ?? false);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setPrimaryProvider(row.provider);
    setPrimaryModel(row.model);
    setFallbackProvider(row.fallbackProvider);
    setFallbackModel(row.fallbackModel ?? "");
    setFallbackEnabled(row.fallbackEnabled ?? false);
  }, [row.provider, row.model, row.fallbackProvider, row.fallbackModel, row.fallbackEnabled]);

  const primaryModels = getAvailableModels(primaryProvider, row.capability);
  const fallbackModels = fallbackProvider
    ? getAvailableModels(fallbackProvider, row.capability)
    : [];
  const supportedFallbackProviders = row.supportedProviders.filter((p) => p !== primaryProvider);

  const isDirty =
    primaryProvider !== row.provider ||
    primaryModel !== row.model ||
    fallbackProvider !== row.fallbackProvider ||
    fallbackModel !== (row.fallbackModel ?? "") ||
    fallbackEnabled !== (row.fallbackEnabled ?? false);

  const handleChangePrimaryProvider = (p: AiProvider) => {
    setPrimaryProvider(p);
    const models = getAvailableModels(p, row.capability);
    setPrimaryModel(models[0] ?? "");
    const others = row.supportedProviders.filter((sp) => sp !== p);
    if (others.length > 0) {
      const fb = others[0];
      setFallbackProvider(fb);
      const fbModels = getAvailableModels(fb, row.capability);
      setFallbackModel(fbModels[0] ?? "");
    } else {
      setFallbackProvider(undefined);
      setFallbackModel("");
    }
  };

  const handleChangeFallbackProvider = (p: AiProvider) => {
    setFallbackProvider(p);
    const models = getAvailableModels(p, row.capability);
    setFallbackModel(models[0] ?? "");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        capability: row.capability,
        provider: primaryProvider,
        model: primaryModel,
        enabled: true,
        fallbackProvider,
        fallbackModel: fallbackModel || undefined,
        fallbackEnabled,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(380)}>
      <SurfaceCard padding={16} style={{ borderRadius: 20 }}>
        {/* Header */}
        <XStack alignItems="center" gap={12} marginBottom={14}>
          <YStack
            width={42}
            height={42}
            borderRadius={13}
            backgroundColor={ACCENT + "15"}
            alignItems="center"
            justifyContent="center"
          >
            <Feather name={meta.icon} size={20} color={ACCENT} />
          </YStack>
          <YStack flex={1}>
            <Text fontSize={15} fontFamily="$body" fontWeight="700" color="$color">
              {meta.label}
            </Text>
            <Text fontSize={12} fontFamily="$body" color="$colorMuted" numberOfLines={1}>
              {meta.description}
            </Text>
          </YStack>
          {isDirty && (
            <YStack
              backgroundColor={ACCENT + "20"}
              borderRadius={8}
              paddingHorizontal={8}
              paddingVertical={3}
            >
              <Text fontSize={10} fontFamily="$body" fontWeight="700" color={ACCENT}>
                UNSAVED
              </Text>
            </YStack>
          )}
        </XStack>

        {/* Default route */}
        <YStack gap={8} marginBottom={12}>
          <Text
            fontSize={11}
            fontFamily="$body"
            fontWeight="700"
            color={ACCENT}
            textTransform="uppercase"
            letterSpacing={0.8}
          >
            Default Route
          </Text>
          <XStack gap={8} flexWrap="wrap">
            {row.supportedProviders.map((p) => (
              <ProviderChip
                key={p}
                provider={p}
                selected={primaryProvider === p}
                onPress={() => handleChangePrimaryProvider(p)}
                theme={theme}
              />
            ))}
          </XStack>
          {primaryModels.length > 0 ? (
            <XStack gap={6} flexWrap="wrap">
              {primaryModels.map((m) => (
                <ModelChip
                  key={m}
                  model={m}
                  selected={primaryModel === m}
                  onPress={() => setPrimaryModel(m)}
                  theme={theme}
                />
              ))}
            </XStack>
          ) : (
            <Text fontSize={12} fontFamily="$body" color="$colorMuted">
              No models available.
            </Text>
          )}
        </YStack>

        {/* Divider */}
        <YStack height={1} backgroundColor={theme.borderColor.val} marginVertical={4} />

        {/* Fallback route */}
        <YStack gap={8} marginTop={10} marginBottom={12}>
          <XStack alignItems="center" justifyContent="space-between">
            <Text
              fontSize={11}
              fontFamily="$body"
              fontWeight="700"
              color={theme.colorMuted.val}
              textTransform="uppercase"
              letterSpacing={0.8}
            >
              Fallback Route
            </Text>
            {fallbackProvider && (
              <PressableScale
                onPress={() => setFallbackEnabled(!fallbackEnabled)}
                style={{ borderRadius: 8 }}
              >
                <YStack
                  paddingHorizontal={10}
                  paddingVertical={4}
                  borderRadius={8}
                  backgroundColor={fallbackEnabled ? "#10B981" + "22" : theme.secondary.val}
                  borderWidth={1}
                  borderColor={fallbackEnabled ? "#10B981" : theme.borderColor.val}
                >
                  <Text
                    fontSize={10}
                    fontFamily="$body"
                    fontWeight="700"
                    color={fallbackEnabled ? "#10B981" : theme.colorMuted.val}
                  >
                    {fallbackEnabled ? "ON" : "OFF"}
                  </Text>
                </YStack>
              </PressableScale>
            )}
          </XStack>

          {supportedFallbackProviders.length > 0 ? (
            <>
              <XStack gap={8} flexWrap="wrap">
                {supportedFallbackProviders.map((p) => (
                  <ProviderChip
                    key={p}
                    provider={p}
                    selected={fallbackProvider === p}
                    onPress={() => handleChangeFallbackProvider(p)}
                    theme={theme}
                  />
                ))}
              </XStack>
              {fallbackModels.length > 0 && (
                <XStack gap={6} flexWrap="wrap">
                  {fallbackModels.map((m) => (
                    <ModelChip
                      key={m}
                      model={m}
                      selected={fallbackModel === m}
                      onPress={() => setFallbackModel(m)}
                      theme={theme}
                    />
                  ))}
                </XStack>
              )}
            </>
          ) : (
            <Text fontSize={12} fontFamily="$body" color="$colorMuted">
              No alternate provider for this capability.
            </Text>
          )}
        </YStack>

        {/* Save */}
        {isDirty && (
          <PressableScale onPress={handleSave} disabled={isSaving} style={{ borderRadius: 12 }}>
            <YStack
              height={40}
              borderRadius={12}
              backgroundColor={ACCENT}
              alignItems="center"
              justifyContent="center"
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text fontSize={14} fontFamily="$body" fontWeight="700" color="#fff">
                  Save changes
                </Text>
              )}
            </YStack>
          </PressableScale>
        )}
      </SurfaceCard>
    </Animated.View>
  );
}

function RoutingSection({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  const { showToast } = useAppToast();
  const routingData = useQuery(api.aiProviders.getAdminRouting, {});
  const setAdminRouting = useMutation(api.aiProviders.setAdminRouting);

  const handleSave = React.useCallback(
    async (patch: Parameters<typeof setAdminRouting>[0]) => {
      try {
        await setAdminRouting(patch);
        showToast({
          title: "Routing updated",
          message: `${patch.capability} → ${patch.provider} / ${patch.model}`,
          tone: "success",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update routing.";
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert("Error", message);
        }
      }
    },
    [setAdminRouting, showToast],
  );

  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ gap: 14 }}>
      {/* Hero card */}
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
          <YStack flex={1} gap={6}>
            <Badge label="AI Routing Config" color={ACCENT} />
            <Text
              fontSize={22}
              lineHeight={26}
              fontFamily="$heading"
              fontWeight="700"
              color="$color"
            >
              Model Routing
            </Text>
            <Text fontSize={13} lineHeight={19} fontFamily="$body" color="$colorMuted">
              Configure the default provider and model per capability, and enable a fallback route
              that activates when the primary fails.
            </Text>
          </YStack>
          <YStack
            width={48}
            height={48}
            borderRadius={16}
            alignItems="center"
            justifyContent="center"
            backgroundColor={ACCENT + "18"}
          >
            <Feather name="sliders" size={20} color={ACCENT} />
          </YStack>
        </XStack>
        <XStack gap={10} marginTop={14} flexWrap="wrap">
          <Badge label="Platform-wide" color={ACCENT} />
          <Badge label="Live config" tone="neutral" />
        </XStack>
      </Card>

      <SectionLabel>AI Capabilities</SectionLabel>

      {routingData === undefined && (
        <YStack alignItems="center" paddingVertical={40}>
          <ActivityIndicator color={ACCENT} />
        </YStack>
      )}

      {routingData && (
        <YStack gap={12}>
          {routingData.map((row, i) => (
            <RoutingCard
              key={row.capability}
              row={row as RoutingRow}
              index={i}
              onSave={handleSave}
            />
          ))}
        </YStack>
      )}
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const theme = useAppTheme();
  const [activeSection, setActiveSection] = React.useState<AdminSection>("analytics");

  const adminStatus = useQuery(api.auth.getAdminStatus);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (adminStatus === undefined) {
    return (
      <MorePageScaffold title="Admin" staticHeader>
        <YStack flex={1} alignItems="center" justifyContent="center" paddingTop={80}>
          <ActivityIndicator color={ACCENT} size="large" />
        </YStack>
      </MorePageScaffold>
    );
  }

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!adminStatus.isAdmin) {
    return (
      <MorePageScaffold title="Admin" staticHeader>
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ padding: 24, borderRadius: 24, marginTop: 16 }}>
            <YStack alignItems="center" gap={14}>
              <YStack
                width={64}
                height={64}
                borderRadius={20}
                backgroundColor={ACCENT + "15"}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="lock" size={28} color={ACCENT} />
              </YStack>
              <YStack alignItems="center" gap={6}>
                <Text
                  fontSize={20}
                  fontFamily="$heading"
                  fontWeight="700"
                  color="$color"
                  textAlign="center"
                >
                  Admin access required
                </Text>
                <Text
                  fontSize={14}
                  fontFamily="$body"
                  color="$colorMuted"
                  textAlign="center"
                  lineHeight={20}
                >
                  Your account doesn't have admin privileges. Contact the platform owner if you
                  think this is a mistake.
                </Text>
              </YStack>
            </YStack>
          </Card>
        </Animated.View>
      </MorePageScaffold>
    );
  }

  // ── Admin UI ───────────────────────────────────────────────────────────────
  return (
    <MorePageScaffold title="Admin" staticHeader noScroll>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page header */}
        <Animated.View entering={FadeInUp.duration(380)}>
          <YStack
            marginBottom={4}
            paddingHorizontal={4}
            paddingTop={2}
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap={10}>
              <YStack
                width={36}
                height={36}
                borderRadius={12}
                backgroundColor={ACCENT + "18"}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="shield" size={16} color={ACCENT} />
              </YStack>
              <YStack>
                <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
                  Admin Console
                </Text>
                <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                  Platform management
                </Text>
              </YStack>
            </XStack>
            <YStack
              backgroundColor={ACCENT + "15"}
              borderRadius={10}
              paddingHorizontal={10}
              paddingVertical={5}
              borderWidth={1}
              borderColor={ACCENT + "40"}
            >
              <Text
                fontSize={10}
                fontFamily="$body"
                fontWeight="800"
                color={ACCENT}
                textTransform="uppercase"
                letterSpacing={1}
              >
                Admin
              </Text>
            </YStack>
          </YStack>
        </Animated.View>

        {/* Section tab bar */}
        <Animated.View entering={FadeInUp.delay(60).duration(380)}>
          <SectionTabBar active={activeSection} onChange={setActiveSection} theme={theme} />
        </Animated.View>

        {/* Divider with section label */}
        <Animated.View entering={FadeInUp.delay(100).duration(380)}>
          <XStack alignItems="center" gap={10} marginVertical={2}>
            <YStack flex={1} height={1} backgroundColor={withAlpha(theme.borderColor.val, "60")} />
            <Text
              fontSize={10}
              fontFamily="$body"
              fontWeight="600"
              color={theme.colorMuted.val}
              textTransform="uppercase"
              letterSpacing={1}
            >
              {activeSection === "analytics" ? "System Analytics" : "AI Routing"}
            </Text>
            <YStack flex={1} height={1} backgroundColor={withAlpha(theme.borderColor.val, "60")} />
          </XStack>
        </Animated.View>

        {/* Active section */}
        {activeSection === "analytics" ? (
          <AnalyticsSection theme={theme} />
        ) : (
          <RoutingSection theme={theme} />
        )}
      </ScrollView>
    </MorePageScaffold>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 100, // below MorePageScaffold header
    paddingBottom: 144,
    paddingHorizontal: 16,
    gap: 14,
  },
});
