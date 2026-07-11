import React, { useCallback, useMemo, useState } from "react";
import { Keyboard, Linking, Pressable } from "react-native";
import { TouchableWithoutFeedback } from "@gorhom/bottom-sheet";
import { Markdown } from "@believer/react-native-markdown-display";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Text, XStack, YStack } from "tamagui";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { DeletionProposalCard } from "./DeletionProposalCard";
import { ReplyTelemetryFooter } from "./ReplyTelemetryFooter";
import { SearchResultsCard } from "./SearchResultsCard";
import { STREAM_CURSOR, useStreamReveal, useStreamRevealMotion } from "./streamReveal";
import type { CardFlow, CardSnapshot, ChatMsg, DeletionItem } from "./types";
import type { MarkdownStyle } from "./rendererUtils";
import { extractSpeakableText, formatMessageTime } from "./rendererUtils";

const CHAT = {
  bubbleRadius: 18,
  bubblePadding: 12,
  bubbleMinWidth: 72,
  messageGap: 9,
} as const;

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "sm");

function AttachmentChip({ name, driveWebViewLink }: { name: string; driveWebViewLink?: string }) {
  const theme = useAppTheme();

  const handlePress = useCallback(() => {
    if (driveWebViewLink) {
      void Linking.openURL(driveWebViewLink);
    }
  }, [driveWebViewLink]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: withAlpha(theme.textInverse.val, "1F"),
        borderWidth: 1,
        borderColor: withAlpha(theme.textInverse.val, "2E"),
        opacity: pressed ? 0.7 : 1,
        alignSelf: "flex-start",
      })}
    >
      <Feather name="paperclip" size={11} color={withAlpha(theme.textInverse.val, "CC")} />
      <Text
        fontSize={11}
        color={withAlpha(theme.textInverse.val, "E6")}
        numberOfLines={1}
        maxWidth={160}
      >
        {name}
      </Text>
    </Pressable>
  );
}

export const ChatBubble = React.memo(function ChatBubble({
  msg,
  isUser,
  mdStyles,
  speakingId,
  onSpeak,
  onCopy,
  token,
  deletionItems,
  cardSnapshots,
  turns,
  flow,
  calendarSyncEnabled,
  onEditMemory,
}: {
  msg: ChatMsg;
  isUser: boolean;
  mdStyles: MarkdownStyle;
  speakingId: string | null;
  onSpeak?: (id: string, text: string) => void;
  onCopy: (text: string) => void;
  token?: string | null;
  deletionItems?: DeletionItem[];
  cardSnapshots?: CardSnapshot[];
  turns?: number;
  flow?: CardFlow;
  calendarSyncEnabled?: boolean;
  onEditMemory?: (id: Id<"memories">) => void;
}) {
  const theme = useAppTheme();
  const isSpeaking = speakingId === msg._id;
  const rawContent = msg.content ?? "";
  const isStreamingAssistant = !isUser && msg.streaming === true;
  const { visibleText: displayContent, isRevealing } = useStreamReveal(
    rawContent,
    isStreamingAssistant,
  );
  const presentationReady = !isRevealing;
  const markdownContent =
    isRevealing && displayContent ? `${displayContent}${STREAM_CURSOR}` : displayContent;
  const streamMotionStyle = useStreamRevealMotion(displayContent.length, !isUser && isRevealing);
  const renderedMarkdown = useMemo(
    () => (markdownContent ? <Markdown style={mdStyles}>{markdownContent}</Markdown> : null),
    [markdownContent, mdStyles],
  );
  const [showActions, setShowActions] = useState(false);
  const scaleAnim = useSharedValue(1);
  const messageTime = useMemo(() => formatMessageTime(msg._creationTime), [msg._creationTime]);
  const actionBackground = isUser ? withAlpha(theme.primary.val, "18") : theme.backgroundStrong.val;

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scaleAnim.value = withSequence(
      withSpring(0.97, { damping: 15 }),
      withSpring(1, { damping: 15 }),
    );
    setShowActions((current) => !current);
  }, [scaleAnim]);

  return (
    <Animated.View entering={undefined} style={{ marginBottom: CHAT.messageGap }}>
      <XStack
        maxWidth={isUser ? "82%" : "90%"}
        gap={7}
        alignSelf={isUser ? "flex-end" : "flex-start"}
      >
        <YStack flex={1} gap={4}>
          <XStack
            alignItems="flex-end"
            gap={8}
            alignSelf={isUser ? "flex-end" : "flex-start"}
            maxWidth="100%"
          >
            <TouchableWithoutFeedback
              onPress={() => Keyboard.dismiss()}
              onLongPress={handleLongPress}
              delayLongPress={400}
            >
              <Animated.View style={[bubbleStyle, { flexShrink: 1 }]}>
                {isUser ? (
                  <YStack
                    borderRadius={CHAT.bubbleRadius}
                    borderBottomRightRadius={6}
                    paddingHorizontal={CHAT.bubblePadding}
                    paddingVertical={4}
                    minWidth={CHAT.bubbleMinWidth}
                    backgroundColor={withAlpha(theme.primary.val, "D6")}
                    gap={msg.attachments && msg.attachments.length > 0 ? 8 : 0}
                    style={getBubbleShadow(theme.shadowColor.val)}
                  >
                    {renderedMarkdown ? (
                      <Animated.View style={streamMotionStyle}>{renderedMarkdown}</Animated.View>
                    ) : null}
                    {msg.attachments?.length ? (
                      <YStack gap={4}>
                        {msg.attachments.map((attachment) => (
                          <AttachmentChip
                            key={attachment.attachmentId}
                            name={attachment.name}
                            driveWebViewLink={attachment.driveWebViewLink}
                          />
                        ))}
                      </YStack>
                    ) : null}
                  </YStack>
                ) : (
                  <YStack
                    paddingHorizontal={CHAT.bubblePadding}
                    paddingVertical={6}
                    minWidth={CHAT.bubbleMinWidth}
                    borderRadius={CHAT.bubbleRadius}
                    backgroundColor={theme.surface.val}
                    borderWidth={1}
                    borderColor={theme.borderSubtle.val}
                    style={[{ borderBottomLeftRadius: 6 }, getBubbleShadow(theme.shadowColor.val)]}
                    gap={msg.attachments && msg.attachments.length > 0 ? 8 : 0}
                    position="relative"
                  >
                    {renderedMarkdown ? (
                      <Animated.View style={streamMotionStyle}>{renderedMarkdown}</Animated.View>
                    ) : null}
                  </YStack>
                )}
              </Animated.View>
            </TouchableWithoutFeedback>

            {!isUser && onSpeak ? (
              <Animated.View entering={isSpeaking ? ZoomIn.duration(200) : FadeIn.duration(200)}>
                <Pressable
                  onPress={() => onSpeak(msg._id, extractSpeakableText(rawContent))}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSpeaking
                      ? withAlpha(theme.primary.val, "10")
                      : theme.surface.val,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isSpeaking
                      ? withAlpha(theme.primary.val, "24")
                      : theme.borderSubtle.val,
                  })}
                >
                  <Feather
                    name={isSpeaking ? "volume-x" : "volume-2"}
                    size={15}
                    color={isSpeaking ? theme.primary.val : theme.colorMuted.val}
                  />
                </Pressable>
              </Animated.View>
            ) : null}
          </XStack>

          {showActions && messageTime ? (
            <Text
              fontSize={10}
              fontFamily="$body"
              color={theme.colorMuted.val}
              alignSelf={isUser ? "flex-end" : "flex-start"}
              paddingHorizontal={4}
            >
              {messageTime}
            </Text>
          ) : null}

          {showActions ? (
            <Animated.View entering={ZoomIn.duration(200)}>
              <XStack gap={6} alignSelf={isUser ? "flex-end" : "flex-start"} paddingHorizontal={4}>
                <Pressable
                  onPress={() => {
                    onCopy(rawContent);
                    setShowActions(false);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: actionBackground,
                    borderWidth: 1,
                    borderColor: isUser
                      ? withAlpha(theme.primary.val, "28")
                      : theme.borderSubtle.val,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="copy" size={12} color={theme.colorMuted.val} />
                  <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                    Copy
                  </Text>
                </Pressable>
              </XStack>
            </Animated.View>
          ) : null}
        </YStack>
      </XStack>

      {!isUser && presentationReady ? <ReplyTelemetryFooter turns={turns} flow={flow} /> : null}
      {!isUser && presentationReady && deletionItems?.length ? (
        <DeletionProposalCard items={deletionItems} token={token} />
      ) : null}
      {!isUser && presentationReady && cardSnapshots?.length ? (
        <SearchResultsCard
          cardSnapshots={cardSnapshots}
          token={token}
          calendarSyncEnabled={calendarSyncEnabled}
          onEdit={onEditMemory}
        />
      ) : null}
    </Animated.View>
  );
});
