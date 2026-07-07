import React, { useEffect, useState } from "react";
import { View } from "react-native";
import {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { Feather } from "@/lib/icons";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import type { ProgressStatus } from "./types";
import {
  formatElapsedTime,
  formatMetaLabel,
  getProgressIcon,
  getProgressTitle,
  getUsefulEvents,
} from "./rendererUtils";

const THINKING_MESSAGES = [
  "Reading your message",
  "Checking relevant context",
  "Choosing the next step",
] as const;

const CHAT = {
  bubbleRadius: 18,
  messageGap: 10,
} as const;

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

function getAccentColor(
  status: ProgressStatus,
  fallback: string,
  semantic: ReturnType<typeof useSemanticColors>,
) {
  const phase = (status.phase ?? "").toLowerCase();
  if (phase === "writing") return semantic.status.warning;
  if (phase === "finalizing") return semantic.status.success;
  if (phase === "analyzing") return semantic.integration.reasoning;
  return fallback;
}

function StableSwapText({
  text,
  fontSize,
  color,
  maxWidth,
  fontFamily,
  opacity,
  numberOfLines,
}: {
  text: string;
  fontSize: number;
  color: string;
  maxWidth?: number;
  fontFamily?: string;
  opacity?: number;
  numberOfLines?: number;
}) {
  return (
    <View
      style={{
        width: maxWidth,
        minHeight: fontSize * 1.45,
        justifyContent: "center",
      }}
    >
      <Text
        fontSize={fontSize}
        color={color}
        numberOfLines={numberOfLines}
        fontFamily={fontFamily}
        opacity={opacity}
      >
        {text}
      </Text>
    </View>
  );
}

export function ThinkingIndicator() {
  const theme = useAppTheme();
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIndex((current) => (current + 1) % THINKING_MESSAGES.length);
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(220)}>
      <XStack gap={8} alignSelf="flex-start" marginBottom={CHAT.messageGap} alignItems="flex-end">
        <Animated.View>
          <YStack
            paddingHorizontal={14}
            paddingVertical={12}
            borderRadius={CHAT.bubbleRadius}
            borderBottomLeftRadius={6}
            backgroundColor={theme.backgroundStrong.val}
            borderWidth={1}
            borderColor={theme.borderSubtle.val}
            style={getBubbleShadow(theme.shadowColor.val)}
          >
            <XStack gap={8} alignItems="center">
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: withAlpha(theme.primary.val, "18"),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="cpu" size={13} color={theme.primary.val} />
              </View>
              <YStack gap={1}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                  Thinking
                </Text>
                <StableSwapText
                  text={THINKING_MESSAGES[phraseIndex]}
                  fontSize={11}
                  color={theme.colorMuted.val}
                  maxWidth={230}
                  numberOfLines={1}
                />
              </YStack>
            </XStack>
          </YStack>
        </Animated.View>
      </XStack>
    </Animated.View>
  );
}

export function ToolProgressBubble({ status }: { status: ProgressStatus }) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const shimmer = useSharedValue(0);
  const [elapsedLabel, setElapsedLabel] = useState(() => formatElapsedTime(status.startedAt));

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [shimmer]);

  useEffect(() => {
    setElapsedLabel(formatElapsedTime(status.startedAt));
    if (!status.startedAt) return;
    const timer = setInterval(() => setElapsedLabel(formatElapsedTime(status.startedAt)), 1000);
    return () => clearInterval(timer);
  }, [status.startedAt]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + shimmer.value * 0.45,
    transform: [{ scale: 0.92 + shimmer.value * 0.12 }],
  }));
  const title = getProgressTitle(status);
  const iconName = getProgressIcon(status);
  const accentColor = getAccentColor(status, theme.primary.val, semantic);
  const events = getUsefulEvents(status);
  const latestEvent = events[events.length - 1];
  const metaLabel = formatMetaLabel(status);

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ marginBottom: CHAT.messageGap }}>
      <XStack gap={8} alignSelf="flex-start" alignItems="center" width="94%">
        <Animated.View style={{ flex: 1 }}>
          <YStack
            paddingHorizontal={9}
            paddingVertical={7}
            borderRadius={16}
            borderBottomLeftRadius={6}
            backgroundColor={theme.backgroundStrong.val}
            borderWidth={1}
            borderColor={theme.borderSubtle.val}
            style={[
              getBubbleShadow(theme.shadowColor.val),
              { minWidth: 240, maxWidth: "100%", position: "relative", overflow: "hidden" },
            ]}
          >
            <XStack gap={8} alignItems="flex-start" paddingLeft={1}>
              <Animated.View style={pulseStyle}>
                <View
                  style={{
                    width: 23,
                    height: 23,
                    borderRadius: 12,
                    backgroundColor: withAlpha(accentColor, "18"),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={iconName} size={11} color={accentColor} />
                </View>
              </Animated.View>

              <YStack gap={3} flex={1} minWidth={0}>
                <XStack justifyContent="space-between" alignItems="center" gap={8}>
                  <Text
                    fontSize={13}
                    color={theme.color.val}
                    fontFamily={FontFamily.semiBold}
                    numberOfLines={1}
                    flexShrink={1}
                  >
                    {title}
                  </Text>
                  {elapsedLabel ? (
                    <Text
                      fontSize={10}
                      color={theme.colorMuted.val}
                      opacity={0.72}
                      paddingHorizontal={6}
                      paddingVertical={2}
                      borderRadius={999}
                      backgroundColor={withAlpha(theme.colorMuted.val, "0F")}
                      minWidth={32}
                      textAlign="center"
                    >
                      {elapsedLabel}
                    </Text>
                  ) : null}
                </XStack>

                <XStack gap={5} alignItems="center" paddingRight={2}>
                  <Text
                    fontSize={11}
                    color={theme.colorMuted.val}
                    numberOfLines={1}
                    opacity={0.9}
                    flexShrink={1}
                    lineHeight={15}
                  >
                    {status.detail?.trim() || "Working..."}
                  </Text>
                  {metaLabel ? (
                    <Text
                      fontSize={10}
                      color={accentColor}
                      opacity={0.9}
                      numberOfLines={1}
                      paddingHorizontal={6}
                      paddingVertical={2}
                      borderRadius={999}
                      backgroundColor={withAlpha(accentColor, "12")}
                      overflow="hidden"
                      maxWidth={96}
                    >
                      {metaLabel}
                    </Text>
                  ) : null}
                </XStack>
              </YStack>
            </XStack>

            {latestEvent ? (
              <Animated.View entering={FadeIn.duration(160)}>
                <XStack gap={6} alignItems="flex-start" marginTop={5} paddingLeft={32}>
                  <View
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 1.5,
                      backgroundColor: accentColor,
                      opacity: 0.6,
                      marginTop: 6,
                    }}
                  />
                  <Text
                    fontSize={10}
                    color={theme.colorMuted.val}
                    opacity={0.72}
                    numberOfLines={1}
                    flex={1}
                    lineHeight={14}
                  >
                    <Text fontFamily={FontFamily.medium}>{latestEvent.label}:</Text>{" "}
                    {latestEvent.value}
                  </Text>
                </XStack>
              </Animated.View>
            ) : null}
          </YStack>
        </Animated.View>
      </XStack>
    </Animated.View>
  );
}
