import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  TouchableOpacity as BottomSheetTouchableOpacity,
} from "@gorhom/bottom-sheet";
import { useQuery } from "convex/react";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { Badge } from "@/components/ui/Badge";
import { FontFamily } from "@/constants/fonts";
import { radius, spacing } from "@/constants/uiTokens";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import type { FeatherIconName } from "@/lib/icons";
import { Feather } from "@/lib/icons";
import { api } from "@/convex/_generated/api";
import { selectSheetOpen, selectSheetPayload, useUIStore } from "@/store/ui";

type FeatureBreakdown = {
  feature: string;
  stage: string;
  visibility: "user_visible" | "background";
  billedTo: "memora" | "user_byok";
  providers: string[];
  models: string[];
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsdMicros: number;
  latencyMs: number;
  avgLatencyMs: number;
  fallback: boolean;
};

type TimelineItem = {
  _id: string;
  occurredAt: number;
  provider: string;
  model: string;
  operation: string;
  feature: string;
  stage: string;
  visibility: "user_visible" | "background";
  billedTo: "memora" | "user_byok";
  status: "success" | "error";
  latencyMs: number;
  totalTokens: number;
  costUsdMicros: number;
  metadata: Record<string, string>;
};

type TurnTelemetry = {
  overview: {
    aiRequests: number;
    aiActions: number;
    backgroundAiOperations: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsdMicros: number;
    totalLatencyMs: number;
    operationCount: number;
  };
  search: {
    searches: number;
    deepSearches: number;
    vectorSearches: number;
    fullTextSearches: number;
    keywordSearches: number;
    searchCacheHits: number;
    avgResults: number;
    avgLatencyMs: number;
  };
  features: FeatureBreakdown[];
  timeline: TimelineItem[];
};

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100_000 ? 2 : 4,
  }).format(value / 1_000_000);
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds >= 10_000 ? 0 : 1)} s`;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatFeatureLabel(feature: string) {
  const map: Record<string, string> = {
    memory_chat: "Chat assistant",
    attachment_extraction: "Attachment reading",
    memory_capture: "Memory capture",
    memory_processing: "Memory processing",
    memory_search: "Search grounding",
    topic_management: "Topic assignment",
    diary_processing: "Diary processing",
    conflict_detection: "Conflict check",
    audio_transcription: "Audio transcription",
    deep_search: "Deep search",
  };
  return map[feature] ?? feature.replace(/_/g, " ");
}

function formatStageLabel(stage?: string | null) {
  return stage ? stage.replace(/_/g, " ") : "unspecified";
}

function featureIcon(feature: string): FeatherIconName {
  if (feature.includes("search")) return "search";
  if (feature.includes("attachment")) return "paperclip";
  if (feature.includes("audio")) return "mic";
  if (feature.includes("topic")) return "tag";
  if (feature.includes("memory") || feature.includes("diary")) return "database";
  return "cpu";
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const theme = useAppTheme();

  return (
    <YStack gap={1}>
      <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
        {title}
      </Text>
      {detail ? (
        <Text fontSize={11} color={theme.colorMuted.val} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </YStack>
  );
}

function Metric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: FeatherIconName;
  color: string;
}) {
  const theme = useAppTheme();

  return (
    <YStack flex={1} minWidth={0} gap={4}>
      <XStack alignItems="center" gap={4}>
        <Feather name={icon} size={11} color={color} />
        <Text fontSize={10} color={theme.colorMuted.val} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
      <Text fontSize={17} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
        {value}
      </Text>
    </YStack>
  );
}

function Signal({ label, value, active }: { label: string; value: string; active?: boolean }) {
  const theme = useAppTheme();
  const color = active ? theme.primary.val : theme.colorMuted.val;

  return (
    <YStack flex={1} minWidth={0} gap={4}>
      <YStack
        height={3}
        borderRadius={radius.pill}
        backgroundColor={active ? withAlpha(color, "A8") : theme.borderSubtle.val}
      />
      <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.color.val}>
        {value}
      </Text>
      <Text fontSize={10} color={theme.colorMuted.val} numberOfLines={1}>
        {label}
      </Text>
    </YStack>
  );
}

export function TurnBreakdownSheet() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();
  const modalRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const { token } = useAuth();
  const open = useUIStore(selectSheetOpen("turnBreakdown"));
  const payload = useUIStore(selectSheetPayload("turnBreakdown"));
  const closeTurnBreakdown = useUIStore((state) => state.closeTurnBreakdown);
  const [expandedFeatureKeys, setExpandedFeatureKeys] = useState<Set<string>>(() => new Set());
  const [showFullTrace, setShowFullTrace] = useState(false);

  const telemetry = useQuery(
    (api.analytics as Record<string, any>).chatTurnBreakdown,
    token && payload?.chatTurnId && open
      ? { token, chatTurnId: payload.chatTurnId as any }
      : "skip",
  ) as TurnTelemetry | undefined;

  const isOpen = open && !!payload?.chatTurnId;
  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    closeTurnBreakdown();
  }, [closeTurnBreakdown]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  useEffect(() => {
    if (isOpen && !presentedRef.current) {
      modalRef.current?.present();
      presentedRef.current = true;
      return;
    }

    if (!isOpen && presentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [isOpen]);

  const overview = telemetry?.overview;
  const search = telemetry?.search;
  const visibleTimeline = showFullTrace
    ? (telemetry?.timeline ?? [])
    : (telemetry?.timeline ?? []).slice(0, 3);

  const toggleFeature = useCallback((key: string) => {
    setExpandedFeatureKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <BottomSheetModal
      ref={modalRef}
      name="turnBreakdown"
      index={0}
      snapPoints={["88%"]}
      maxDynamicContentSize={760}
      enablePanDownToClose
      detached={isLargeScreen}
      style={
        isLargeScreen
          ? {
              marginHorizontal: spacing.lg,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }
          : undefined
      }
      topInset={isLargeScreen ? insets.top + spacing.lg : insets.top}
      bottomInset={isLargeScreen ? insets.bottom + spacing.lg : insets.bottom}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize"
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface.val }}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <XStack alignItems="center" justifyContent="space-between" gap={spacing.md}>
          <YStack flex={1} minWidth={0} gap={2}>
            <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
              Turn details
            </Text>
            <Text fontSize={12} color={theme.colorMuted.val}>
              A compact record of what powered this reply
            </Text>
          </YStack>
          <BottomSheetTouchableOpacity onPress={closeTurnBreakdown} hitSlop={8}>
            <XStack
              width={36}
              height={36}
              borderRadius={radius.pill}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.backgroundStrong.val}
            >
              <Feather name="x" size={18} color={theme.colorMuted.val} />
            </XStack>
          </BottomSheetTouchableOpacity>
        </XStack>

        <YStack
          gap={spacing.lg}
          padding={spacing.lg}
          borderRadius={radius.lg}
          backgroundColor={withAlpha(theme.primary.val, "0C")}
          borderWidth={1}
          borderColor={withAlpha(theme.primary.val, "20")}
        >
          <XStack alignItems="flex-start" justifyContent="space-between" gap={spacing.md}>
            <YStack flex={1} gap={4}>
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
                ESTIMATED TURN COST
              </Text>
              <Text fontSize={30} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {formatUsdMicros(overview?.costUsdMicros ?? 0)}
              </Text>
              <Text fontSize={11} color={theme.colorMuted.val}>
                {formatCompactNumber(overview?.operationCount ?? 0)} tracked operations ·{" "}
                {formatDuration(overview?.totalLatencyMs ?? 0)} total runtime
              </Text>
            </YStack>
            <XStack
              width={42}
              height={42}
              borderRadius={radius.md}
              alignItems="center"
              justifyContent="center"
              backgroundColor={withAlpha(semantic.status.success, "16")}
            >
              <Feather name="dollar-sign" size={19} color={semantic.status.success} />
            </XStack>
          </XStack>

          <XStack
            gap={spacing.md}
            paddingTop={spacing.md}
            borderTopWidth={1}
            borderTopColor={withAlpha(theme.primary.val, "18")}
          >
            <Metric
              label="Model calls"
              value={formatCompactNumber(overview?.aiRequests ?? 0)}
              icon="cpu"
              color={theme.primary.val}
            />
            <Metric
              label="Tokens"
              value={formatCompactNumber(overview?.totalTokens ?? 0)}
              icon="layers"
              color={semantic.integration.openai}
            />
            <Metric
              label="Searches"
              value={formatCompactNumber(search?.searches ?? 0)}
              icon="search"
              color={theme.info.val}
            />
            <Metric
              label="Failures"
              value={formatCompactNumber(overview?.failures ?? 0)}
              icon={overview?.failures ? "alert-circle" : "check-circle"}
              color={overview?.failures ? semantic.status.error : semantic.status.success}
            />
          </XStack>
        </YStack>

        <YStack gap={spacing.md}>
          <SectionHeading
            title="Work split"
            detail={`${formatCompactNumber(overview?.aiActions ?? 0)} visible actions · ${formatCompactNumber(overview?.backgroundAiOperations ?? 0)} background tasks`}
          />
          {(telemetry?.features ?? []).length > 0 ? (
            <YStack borderTopWidth={1} borderTopColor={theme.borderSubtle.val}>
              {telemetry?.features.map((item) => {
                const featureKey = `${item.feature}-${item.stage}-${item.visibility}`;
                const isExpanded = expandedFeatureKeys.has(featureKey);
                const color =
                  item.errors > 0
                    ? semantic.status.error
                    : item.visibility === "user_visible"
                      ? theme.primary.val
                      : semantic.integration.openai;
                return (
                  <Pressable
                    key={featureKey}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatFeatureLabel(item.feature)} details`}
                    accessibilityState={{ expanded: isExpanded }}
                    onPress={() => toggleFeature(featureKey)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                  >
                    <YStack
                      gap={7}
                      paddingVertical={spacing.md}
                      borderBottomWidth={1}
                      borderBottomColor={theme.borderSubtle.val}
                    >
                      <XStack alignItems="center" gap={spacing.sm}>
                        <Feather name={featureIcon(item.feature)} size={14} color={color} />
                        <YStack flex={1} minWidth={0} gap={1}>
                          <Text
                            fontSize={13}
                            fontFamily={FontFamily.semiBold}
                            color={theme.color.val}
                            numberOfLines={1}
                          >
                            {formatFeatureLabel(item.feature)}
                          </Text>
                          <Text fontSize={11} color={theme.colorMuted.val} numberOfLines={1}>
                            {formatStageLabel(item.stage)} · {item.providers.join(" / ")}
                          </Text>
                        </YStack>
                        <YStack alignItems="flex-end" gap={1}>
                          <Text
                            fontSize={12}
                            fontFamily={FontFamily.semiBold}
                            color={theme.color.val}
                          >
                            {formatUsdMicros(item.costUsdMicros)}
                          </Text>
                          <Text fontSize={10} color={theme.colorMuted.val}>
                            {formatCompactNumber(item.requests)} calls
                          </Text>
                        </YStack>
                        <Feather
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={14}
                          color={theme.colorMuted.val}
                        />
                      </XStack>
                      {isExpanded ? (
                        <XStack gap={6} flexWrap="wrap">
                          <Badge
                            label={`${formatCompactNumber(item.inputTokens)} in · ${formatCompactNumber(item.outputTokens)} out`}
                            small
                            tone="neutral"
                          />
                          <Badge
                            label={`${formatCompactNumber(item.totalTokens)} tokens`}
                            small
                            tone="neutral"
                          />
                          <Badge
                            label={`${formatDuration(item.avgLatencyMs)} avg`}
                            small
                            tone="neutral"
                          />
                          <Badge
                            label={item.billedTo === "memora" ? "Memora billed" : "Your key"}
                            small
                            tone="neutral"
                          />
                          <Badge label={item.models.join(" / ")} small tone="neutral" />
                          {item.fallback ? (
                            <Badge label="Fallback used" small tone="warning" />
                          ) : null}
                          {item.errors > 0 ? (
                            <Badge label={`${item.errors} failed`} small tone="error" />
                          ) : null}
                        </XStack>
                      ) : (
                        <XStack alignItems="center" justifyContent="space-between">
                          <Text fontSize={11} color={theme.colorMuted.val}>
                            {formatCompactNumber(item.totalTokens)} tokens ·{" "}
                            {formatDuration(item.avgLatencyMs)} avg
                          </Text>
                          <Text
                            fontSize={11}
                            fontFamily={FontFamily.semiBold}
                            color={theme.primary.val}
                          >
                            Details
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  </Pressable>
                );
              })}
            </YStack>
          ) : (
            <Text fontSize={12} color={theme.colorMuted.val}>
              Loading tracked operations…
            </Text>
          )}
        </YStack>

        <YStack gap={spacing.md}>
          <SectionHeading
            title="Retrieval signal"
            detail={`${formatCompactNumber(search?.deepSearches ?? 0)} deep searches · ${Math.round(search?.avgLatencyMs ?? 0)} ms average`}
          />
          <XStack
            gap={spacing.md}
            paddingVertical={spacing.sm}
            borderTopWidth={1}
            borderBottomWidth={1}
            borderColor={theme.borderSubtle.val}
          >
            <Signal
              label="Vector"
              value={formatCompactNumber(search?.vectorSearches ?? 0)}
              active={(search?.vectorSearches ?? 0) > 0}
            />
            <Signal
              label="Full text"
              value={formatCompactNumber(search?.fullTextSearches ?? 0)}
              active={(search?.fullTextSearches ?? 0) > 0}
            />
            <Signal
              label="Keyword"
              value={formatCompactNumber(search?.keywordSearches ?? 0)}
              active={(search?.keywordSearches ?? 0) > 0}
            />
            <Signal
              label="Cache hits"
              value={formatCompactNumber(search?.searchCacheHits ?? 0)}
              active={(search?.searchCacheHits ?? 0) > 0}
            />
            <Signal label="Avg. results" value={(search?.avgResults ?? 0).toFixed(1)} />
          </XStack>
        </YStack>

        <YStack gap={spacing.md}>
          <XStack alignItems="center" gap={spacing.sm}>
            <YStack flex={1} minWidth={0}>
              <SectionHeading
                title="Execution trace"
                detail="Ordered backend operations for this reply"
              />
            </YStack>
            {(telemetry?.timeline.length ?? 0) > 3 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showFullTrace ? "Show fewer operations" : "Show all operations"}
                onPress={() => setShowFullTrace((current) => !current)}
                style={({ pressed }) => ({ opacity: pressed ? 0.66 : 1 })}
              >
                <XStack alignItems="center" gap={3} paddingVertical={4}>
                  <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
                    {showFullTrace ? "Show less" : `Show all ${telemetry?.timeline.length}`}
                  </Text>
                  <Feather
                    name={showFullTrace ? "chevron-up" : "chevron-down"}
                    size={13}
                    color={theme.primary.val}
                  />
                </XStack>
              </Pressable>
            ) : null}
          </XStack>
          {(telemetry?.timeline ?? []).length > 0 ? (
            <YStack>
              {visibleTimeline.map((item, index) => {
                const color =
                  item.status === "error"
                    ? semantic.status.error
                    : item.visibility === "user_visible"
                      ? theme.primary.val
                      : semantic.integration.openai;
                const metadata = Object.entries(item.metadata);
                return (
                  <XStack key={item._id} gap={spacing.sm}>
                    <YStack width={16} alignItems="center">
                      <YStack
                        width={10}
                        height={10}
                        marginTop={4}
                        borderRadius={radius.pill}
                        backgroundColor={color}
                        style={appShadow(color, "hairline")}
                      />
                      {index < visibleTimeline.length - 1 ? (
                        <YStack
                          flex={1}
                          width={1}
                          marginVertical={4}
                          backgroundColor={theme.borderSubtle.val}
                        />
                      ) : null}
                    </YStack>
                    <YStack
                      flex={1}
                      minWidth={0}
                      gap={6}
                      paddingBottom={index < visibleTimeline.length - 1 ? spacing.lg : 0}
                    >
                      <XStack
                        alignItems="flex-start"
                        justifyContent="space-between"
                        gap={spacing.sm}
                      >
                        <YStack flex={1} minWidth={0} gap={1}>
                          <Text
                            fontSize={13}
                            fontFamily={FontFamily.semiBold}
                            color={theme.color.val}
                            numberOfLines={1}
                          >
                            {formatFeatureLabel(item.feature)}
                          </Text>
                          <Text fontSize={11} color={theme.colorMuted.val} numberOfLines={1}>
                            {formatStageLabel(item.stage)} · {item.operation}
                          </Text>
                        </YStack>
                        <Text
                          fontSize={12}
                          fontFamily={FontFamily.semiBold}
                          color={theme.color.val}
                        >
                          {item.costUsdMicros ? formatUsdMicros(item.costUsdMicros) : "—"}
                        </Text>
                      </XStack>
                      <Text fontSize={11} color={theme.colorMuted.val}>
                        {item.provider} · {item.model} · {formatTime(item.occurredAt)} ·{" "}
                        {formatDuration(item.latencyMs)}
                      </Text>
                      <XStack gap={6} flexWrap="wrap">
                        <Badge
                          label={item.visibility === "user_visible" ? "Visible" : "Background"}
                          small
                          tone={item.visibility === "user_visible" ? "primary" : "neutral"}
                        />
                        <Badge
                          label={item.billedTo === "memora" ? "Memora billed" : "Your key"}
                          small
                          tone="neutral"
                        />
                        <Badge
                          label={item.status === "error" ? "Failed" : "Completed"}
                          small
                          tone={item.status === "error" ? "error" : "success"}
                        />
                        <Badge
                          label={
                            item.totalTokens
                              ? `${formatCompactNumber(item.totalTokens)} tokens`
                              : "No token usage"
                          }
                          small
                          tone="neutral"
                        />
                        {metadata.map(([key, value]) => (
                          <Badge
                            key={`${item._id}-${key}`}
                            label={`${key}: ${value}`}
                            small
                            tone="neutral"
                          />
                        ))}
                      </XStack>
                    </YStack>
                  </XStack>
                );
              })}
            </YStack>
          ) : (
            <Text fontSize={12} color={theme.colorMuted.val}>
              No finalized telemetry for this turn yet.
            </Text>
          )}
        </YStack>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
