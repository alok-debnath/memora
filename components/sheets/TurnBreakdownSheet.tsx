import React, { useCallback, useEffect, useRef } from "react";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  TouchableOpacity as BottomSheetTouchableOpacity,
} from "@gorhom/bottom-sheet";
import { useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { Badge } from "@/components/ui/Badge";
import { FontFamily } from "@/constants/fonts";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { Feather } from "@/lib/icons";
import { api } from "@/convex/_generated/api";
import { selectSheetOpen, selectSheetPayload, useUIStore } from "@/store/ui";

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

function formatFeatureLabel(feature: string) {
  const map: Record<string, string> = {
    memory_chat: "Chat assistant",
    attachment_extraction: "Image / document extraction",
    memory_capture: "Memory capture",
    memory_processing: "Memory processing",
    memory_search: "Search grounding",
    topic_management: "Topic assignment",
    diary_processing: "Diary processing",
    conflict_detection: "Conflict detection",
    audio_transcription: "Audio transcription",
    deep_search: "Deep search",
  };
  return map[feature] ?? feature.replace(/_/g, " ");
}

function formatStageLabel(stage?: string | null) {
  return stage ? stage.replace(/_/g, " ") : "unspecified";
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

  const telemetry = useQuery(
    (api.analytics as Record<string, any>).chatTurnBreakdown,
    token && payload?.chatTurnId && open
      ? { token, chatTurnId: payload.chatTurnId as any }
      : "skip",
  );

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

  return (
    <BottomSheetModal
      ref={modalRef}
      name="turnBreakdown"
      index={0}
      snapPoints={["86%"]}
      maxDynamicContentSize={700}
      enablePanDownToClose
      detached={isLargeScreen}
      style={
        isLargeScreen
          ? {
              marginHorizontal: 16,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }
          : undefined
      }
      topInset={isLargeScreen ? insets.top + 16 : insets.top}
      bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      enableContentPanningGesture={false}
      android_keyboardInputMode="adjustResize"
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface.val }}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 32,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <XStack alignItems="center" justifyContent="space-between" gap={12}>
          <YStack flex={1} minWidth={0} gap={2}>
            <Text fontSize={18} fontWeight="700" color={theme.color.val}>
              Turn Breakdown
            </Text>
            <Text fontSize={13} lineHeight={18} color={theme.colorMuted.val}>
              Everything tracked for this completed chat turn
            </Text>
          </YStack>
          <BottomSheetTouchableOpacity onPress={closeTurnBreakdown} hitSlop={8}>
            <XStack width={36} height={36} alignItems="center" justifyContent="center">
              <Feather name="x" size={18} color={theme.colorMuted.val} />
            </XStack>
          </BottomSheetTouchableOpacity>
        </XStack>

        <XStack gap={10} flexWrap="wrap">
          <Badge
            label={`${formatCompactNumber(telemetry?.overview.aiActions ?? 0)} AI actions`}
            color={theme.primary.val}
          />
          <Badge
            label={`${formatCompactNumber(telemetry?.overview.aiRequests ?? 0)} backend ops`}
          />
          <Badge
            label={`${formatCompactNumber(telemetry?.overview.totalTokens ?? 0)} tokens`}
            color={semantic.integration.openai}
          />
          <Badge
            label={formatUsdMicros(telemetry?.overview.costUsdMicros ?? 0)}
            color={semantic.status.success}
          />
        </XStack>

        <YStack
          gap={8}
          padding={16}
          borderRadius={16}
          backgroundColor={theme.card.val}
          style={appShadow(theme.shadowColor.val, "xs")}
        >
          <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
            Turn summary
          </Text>
          <Text fontSize={12} color={theme.colorMuted.val} lineHeight={18}>
            {formatCompactNumber(telemetry?.overview.aiActions ?? 0)} user-visible actions triggered{" "}
            {formatCompactNumber(telemetry?.overview.operationCount ?? 0)} tracked operations.
            Searches: {formatCompactNumber(telemetry?.search.searches ?? 0)}.
          </Text>
        </YStack>

        <YStack gap={10}>
          <Text fontSize={12} fontFamily={FontFamily.semiBold} color={theme.colorMuted.val}>
            Feature breakdown
          </Text>
          {(telemetry?.features ?? []).length > 0 ? (
            telemetry?.features.map((item: any) => (
              <YStack
                key={`${item.feature}-${item.stage}-${item.visibility}`}
                gap={6}
                padding={14}
                borderRadius={14}
                backgroundColor={withAlpha(
                  item.visibility === "user_visible"
                    ? theme.primary.val
                    : semantic.integration.openai,
                  "08",
                )}
                style={appShadow(
                  item.visibility === "user_visible"
                    ? theme.primary.val
                    : semantic.integration.openai,
                  "hairline",
                )}
              >
                <XStack justifyContent="space-between" gap={10}>
                  <YStack flex={1}>
                    <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                      {formatFeatureLabel(item.feature)}
                    </Text>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {formatStageLabel(item.stage)} ·{" "}
                      {item.visibility === "user_visible" ? "user visible" : "background"}
                      {item.fallback ? " · fallback chain" : ""}
                    </Text>
                  </YStack>
                  <YStack alignItems="flex-end">
                    <Text fontSize={12} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                      {formatUsdMicros(item.costUsdMicros)}
                    </Text>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {formatCompactNumber(item.requests)} calls
                    </Text>
                  </YStack>
                </XStack>
                <XStack gap={8} flexWrap="wrap">
                  <Badge label={`${formatCompactNumber(item.totalTokens)} tokens`} />
                  <Badge label={`${Math.round(item.avgLatencyMs)} ms avg`} />
                  <Badge label={`${item.errors} failures`} />
                </XStack>
              </YStack>
            ))
          ) : (
            <Text fontSize={12} color={theme.colorMuted.val}>
              Loading tracked operations…
            </Text>
          )}
        </YStack>

        <YStack gap={10}>
          <Text fontSize={12} fontFamily={FontFamily.semiBold} color={theme.colorMuted.val}>
            Retrieval
          </Text>
          <XStack gap={8} flexWrap="wrap">
            <Badge label={`${formatCompactNumber(telemetry?.search.searches ?? 0)} searches`} />
            <Badge label={`${formatCompactNumber(telemetry?.search.deepSearches ?? 0)} deep`} />
            <Badge
              label={`${formatCompactNumber(telemetry?.search.vectorSearches ?? 0)}/${formatCompactNumber(telemetry?.search.fullTextSearches ?? 0)} vector/full-text`}
            />
            <Badge label={`${Math.round(telemetry?.search.avgLatencyMs ?? 0)} ms avg latency`} />
          </XStack>
        </YStack>

        <Text fontSize={12} fontFamily={FontFamily.semiBold} color={theme.colorMuted.val}>
          Operation timeline
        </Text>

        {(telemetry?.timeline ?? []).length > 0 ? (
          telemetry?.timeline.map((item: any) => (
            <XStack
              key={item._id}
              padding={14}
              gap={10}
              borderRadius={14}
              backgroundColor={withAlpha(
                item.status === "error" ? semantic.status.error : theme.backgroundStrong.val,
                item.status === "error" ? "10" : "66",
              )}
              style={appShadow(
                item.status === "error" ? semantic.status.error : theme.shadowColor.val,
                "hairline",
              )}
            >
              <YStack
                width={10}
                height={10}
                marginTop={4}
                borderRadius={5}
                backgroundColor={
                  item.status === "error"
                    ? semantic.status.error
                    : item.visibility === "user_visible"
                      ? theme.primary.val
                      : semantic.integration.openai
                }
              />
              <YStack flex={1} gap={3}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                  {formatFeatureLabel(item.feature)}
                </Text>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  {formatStageLabel(item.stage)} · {item.model} · {item.provider}
                </Text>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  {new Date(item.occurredAt).toLocaleTimeString()} · {item.latencyMs} ms
                </Text>
              </YStack>
              <YStack alignItems="flex-end" gap={3}>
                <Text fontSize={12} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                  {item.costUsdMicros ? formatUsdMicros(item.costUsdMicros) : "n/a"}
                </Text>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  {item.totalTokens ? `${formatCompactNumber(item.totalTokens)} tok` : item.status}
                </Text>
              </YStack>
            </XStack>
          ))
        ) : (
          <Text fontSize={12} color={theme.colorMuted.val}>
            No finalized telemetry for this turn yet.
          </Text>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
