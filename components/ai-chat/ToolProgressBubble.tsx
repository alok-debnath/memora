import React, { useEffect, useMemo, useState } from "react";
import { Text as RNText, View } from "react-native";
import {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
import { FontFamily } from "@/constants/fonts";
import { integrationAccentColors, statusAccentColors } from "@/constants/colors";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { appShadow } from "@/components/ui/themeHelpers";
import type { ProgressStatus } from "./types";
import {
  formatElapsedTime,
  formatMetaLabel,
  getProgressIcon,
  getProgressTitle,
  getUsefulEvents,
} from "./rendererUtils";

const PROGRESS_LAYOUT = LinearTransition.springify().damping(18).stiffness(180);
const AnimatedRNText = Animated.createAnimatedComponent(RNText);
const THINKING_MESSAGES = [
  "Reading your message",
  "Checking relevant context",
  "Planning the next backend step",
] as const;

const CHAT = {
  bubbleRadius: 18,
  messageGap: 14,
} as const;

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

function getAccentColor(status: ProgressStatus, fallback: string) {
  const phase = (status.phase ?? "").toLowerCase();
  if (phase === "writing") return statusAccentColors.warning;
  if (phase === "finalizing") return statusAccentColors.success;
  if (phase === "analyzing") return integrationAccentColors.reasoning;
  return fallback;
}

function AnimatedSwapText({
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
    <Animated.View
      layout={PROGRESS_LAYOUT}
      style={{ minHeight: fontSize * 1.45, justifyContent: "center" }}
    >
      <Animated.View
        key={text}
        layout={PROGRESS_LAYOUT}
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
      >
        <Text
          fontSize={fontSize}
          color={color}
          maxWidth={maxWidth}
          numberOfLines={numberOfLines}
          fontFamily={fontFamily}
          opacity={opacity}
        >
          {text}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function LoadingSweepChar({
  char,
  index,
  sweep,
  color,
  fontSize,
  fontFamily,
  numberOfLines,
}: {
  char: string;
  index: number;
  sweep: SharedValue<number>;
  color: string;
  fontSize: number;
  fontFamily?: string;
  numberOfLines?: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(sweep.value - index);
    let opacity = 1;
    if (distance < 0.6) opacity = 0.38;
    else if (distance < 1.2) opacity = 0.56;
    else if (distance < 2) opacity = 0.78;
    return { opacity };
  }, [index, sweep]);

  return (
    <AnimatedRNText
      numberOfLines={numberOfLines}
      style={[{ color, fontSize, fontFamily }, animatedStyle]}
    >
      {char}
    </AnimatedRNText>
  );
}

function LoadingSweepText({
  text,
  color,
  fontSize,
  fontFamily,
  numberOfLines,
}: {
  text: string;
  color: string;
  fontSize: number;
  fontFamily?: string;
  numberOfLines?: number;
}) {
  const sweep = useSharedValue(-3);
  const characters = useMemo(() => text.split(""), [text]);

  useEffect(() => {
    sweep.value = -3;
    sweep.value = withRepeat(
      withTiming(characters.length + 2, {
        duration: Math.max(1200, characters.length * 85),
      }),
      -1,
      false,
    );
  }, [characters.length, sweep, text]);

  return (
    <View style={{ flexDirection: "row", flexWrap: "nowrap", flexShrink: 1 }}>
      {characters.map((char, index) => (
        <LoadingSweepChar
          key={`${char}-${index}`}
          char={char}
          index={index}
          sweep={sweep}
          color={color}
          fontSize={fontSize}
          fontFamily={fontFamily}
          numberOfLines={numberOfLines}
        />
      ))}
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
    <Animated.View entering={FadeInDown.duration(220)} layout={PROGRESS_LAYOUT}>
      <XStack gap={8} alignSelf="flex-start" marginBottom={CHAT.messageGap} alignItems="flex-end">
        <Animated.View layout={PROGRESS_LAYOUT}>
          <YStack
            paddingHorizontal={14}
            paddingVertical={12}
            borderRadius={CHAT.bubbleRadius}
            borderBottomLeftRadius={6}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            gap={8}
            style={getBubbleShadow(theme.shadowColor.val)}
          >
            <XStack gap={8} alignItems="center">
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: `${theme.primary.val}18`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="cpu" size={13} color={theme.primary.val} />
              </View>
              <YStack gap={1}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$color">
                  Thinking
                </Text>
                <AnimatedSwapText
                  text={THINKING_MESSAGES[phraseIndex]}
                  fontSize={11}
                  color="$colorMuted"
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
  const shimmer = useSharedValue(0);
  const [elapsedLabel, setElapsedLabel] = useState(() => formatElapsedTime(status.startedAt));

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1,
      false,
    );
  }, [shimmer]);

  useEffect(() => {
    setElapsedLabel(formatElapsedTime(status.startedAt));
    if (!status.startedAt) return;
    const timer = setInterval(() => setElapsedLabel(formatElapsedTime(status.startedAt)), 1000);
    return () => clearInterval(timer);
  }, [status.startedAt]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + shimmer.value * 0.65,
  }));
  const title = getProgressTitle(status);
  const iconName = getProgressIcon(status);
  const accentColor = getAccentColor(status, theme.primary.val);
  const events = getUsefulEvents(status);
  const latestEvent = events[events.length - 1];
  const metaLabel = formatMetaLabel(status);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      layout={PROGRESS_LAYOUT}
      style={{ marginBottom: CHAT.messageGap }}
    >
      <XStack gap={8} alignSelf="flex-start" alignItems="center">
        <Animated.View layout={PROGRESS_LAYOUT}>
          <YStack
            paddingHorizontal={12}
            paddingVertical={10}
            borderRadius={22}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            style={[
              getBubbleShadow(theme.shadowColor.val),
              { minWidth: 200, maxWidth: 320, position: "relative" },
            ]}
          >
            <XStack gap={10} alignItems="center">
              <Animated.View style={dotStyle}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: `${accentColor}18`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={iconName} size={12} color={accentColor} />
                </View>
              </Animated.View>

              <YStack gap={1} flex={1}>
                <XStack justifyContent="space-between" alignItems="center" gap={8}>
                  <LoadingSweepText
                    text={title}
                    fontSize={13}
                    color={theme.color.val}
                    fontFamily={FontFamily.semiBold}
                    numberOfLines={1}
                  />
                  {elapsedLabel ? (
                    <Text fontSize={9} color="$colorMuted" opacity={0.6}>
                      {elapsedLabel}
                    </Text>
                  ) : null}
                </XStack>

                <XStack gap={5} alignItems="center" paddingRight={4}>
                  <Text
                    fontSize={11}
                    color="$colorMuted"
                    numberOfLines={1}
                    opacity={0.84}
                    flexShrink={1}
                  >
                    {status.detail?.trim() || "Working..."}
                  </Text>
                  {metaLabel ? (
                    <>
                      <View
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: 1.5,
                          backgroundColor: theme.colorMuted.val,
                          opacity: 0.2,
                        }}
                      />
                      <Text fontSize={10} color="$colorMuted" opacity={0.6} numberOfLines={1}>
                        {metaLabel}
                      </Text>
                    </>
                  ) : null}
                </XStack>
              </YStack>
            </XStack>

            {latestEvent ? (
              <Animated.View layout={PROGRESS_LAYOUT} entering={FadeIn.duration(200)}>
                <XStack gap={6} alignItems="center" marginTop={6} paddingLeft={36}>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: accentColor,
                      opacity: 0.6,
                    }}
                  />
                  <Text
                    fontSize={10}
                    color="$colorMuted"
                    opacity={0.7}
                    numberOfLines={1}
                    paddingRight={10}
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
