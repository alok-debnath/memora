import React, { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
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
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { DeletionProposalCard } from "./DeletionProposalCard";
import { SearchResultsCard } from "./SearchResultsCard";
import type { CardFlow, ChatMsg, DeletionItem } from "./types";
import type { MarkdownStyle } from "./rendererUtils";
import { extractSpeakableText, formatMessageTime } from "./rendererUtils";

const CHAT = {
  bubbleRadius: 18,
  bubblePadding: 14,
  messageGap: 14,
} as const;

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

function AttachmentChip({
  name,
  attachmentId,
  token,
}: {
  name: string;
  attachmentId: Id<"memoryAttachments">;
  token?: string | null;
}) {
  const theme = useAppTheme();
  const attachment = useQuery(
    api.attachments.getAttachment,
    token ? { token, attachmentId } : "skip",
  );

  const handlePress = useCallback(() => {
    if (attachment?.driveWebViewLink) {
      void Linking.openURL(attachment.driveWebViewLink);
    }
  }, [attachment?.driveWebViewLink]);

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
  cardIds,
  cardIsCached,
  cardTurns,
  cardFlow,
  calendarSyncEnabled,
  onDeepSearch,
  onEditMemory,
}: {
  msg: ChatMsg;
  isUser: boolean;
  mdStyles: MarkdownStyle;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  onCopy: (text: string) => void;
  token?: string | null;
  deletionItems?: DeletionItem[];
  cardIds?: Id<"memories">[];
  cardIsCached?: boolean;
  cardTurns?: number;
  cardFlow?: CardFlow;
  calendarSyncEnabled?: boolean;
  onDeepSearch?: (messageId: string, query: string) => void;
  onEditMemory?: (id: Id<"memories">) => void;
}) {
  const theme = useAppTheme();
  const isSpeaking = speakingId === msg._id;
  const [showActions, setShowActions] = useState(false);
  const scaleAnim = useSharedValue(1);
  const messageTime = useMemo(() => formatMessageTime(msg._creationTime), [msg._creationTime]);
  const headerTone = isUser ? withAlpha(theme.textInverse.val, "CC") : theme.colorMuted.val;
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
      <XStack maxWidth="82%" gap={8} alignSelf={isUser ? "flex-end" : "flex-start"}>
        <YStack flex={1} gap={4}>
          <XStack
            alignItems="flex-end"
            gap={8}
            alignSelf={isUser ? "flex-end" : "flex-start"}
            maxWidth="100%"
          >
            <Pressable onLongPress={handleLongPress} delayLongPress={400} style={{ flexShrink: 1 }}>
              <Animated.View style={bubbleStyle}>
                {isUser ? (
                  <YStack
                    borderRadius={CHAT.bubbleRadius}
                    borderBottomRightRadius={6}
                    paddingHorizontal={CHAT.bubblePadding}
                    paddingVertical={12}
                    backgroundColor={theme.primary.val}
                    gap={msg.attachments && msg.attachments.length > 0 ? 8 : 0}
                    style={getBubbleShadow(theme.shadowColor.val)}
                  >
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={4}>
                      <Text
                        fontSize={10}
                        fontFamily="$body"
                        fontWeight="700"
                        letterSpacing={0.4}
                        color={headerTone}
                      >
                        YOU
                      </Text>
                      {messageTime ? (
                        <Text
                          fontSize={10}
                          fontFamily="$body"
                          color={withAlpha(theme.textInverse.val, "A8")}
                        >
                          {messageTime}
                        </Text>
                      ) : null}
                    </XStack>
                    {msg.content ? <Markdown style={mdStyles}>{msg.content}</Markdown> : null}
                    {msg.attachments?.length ? (
                      <YStack gap={4}>
                        {msg.attachments.map((attachment) => (
                          <AttachmentChip
                            key={attachment.attachmentId}
                            name={attachment.name}
                            attachmentId={attachment.attachmentId}
                            token={token}
                          />
                        ))}
                      </YStack>
                    ) : null}
                  </YStack>
                ) : (
                  <YStack
                    paddingHorizontal={CHAT.bubblePadding}
                    paddingVertical={12}
                    borderRadius={CHAT.bubbleRadius}
                    backgroundColor={theme.surfaceElevated.val}
                    borderWidth={1}
                    borderColor={theme.borderSubtle.val}
                    style={[{ borderBottomLeftRadius: 6 }, getBubbleShadow(theme.shadowColor.val)]}
                    gap={msg.attachments && msg.attachments.length > 0 ? 8 : 0}
                  >
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={4}>
                      <XStack gap={6} alignItems="center">
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: withAlpha(theme.primary.val, "14"),
                            borderWidth: 1,
                            borderColor: withAlpha(theme.primary.val, "20"),
                          }}
                        >
                          <Feather name="cpu" size={10} color={theme.primary.val} />
                        </View>
                        <Text
                          fontSize={10}
                          fontFamily="$body"
                          fontWeight="700"
                          letterSpacing={0.4}
                          color="$primary"
                        >
                          MEMORA
                        </Text>
                      </XStack>
                      {messageTime ? (
                        <Text fontSize={10} fontFamily="$body" color="$colorMuted">
                          {messageTime}
                        </Text>
                      ) : null}
                    </XStack>
                    {msg.content ? <Markdown style={mdStyles}>{msg.content}</Markdown> : null}
                  </YStack>
                )}
              </Animated.View>
            </Pressable>

            {!isUser ? (
              <Animated.View entering={isSpeaking ? ZoomIn.duration(200) : FadeIn.duration(200)}>
                <Pressable
                  onPress={() => onSpeak(msg._id, extractSpeakableText(msg.content ?? ""))}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    width: 32,
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSpeaking
                      ? withAlpha(theme.primary.val, "10")
                      : theme.surface.val,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isSpeaking
                      ? withAlpha(theme.primary.val, "24")
                      : theme.borderSubtle.val,
                  })}
                >
                  <Feather
                    name={isSpeaking ? "volume-x" : "volume-2"}
                    size={18}
                    color={isSpeaking ? theme.primary.val : theme.colorMuted.val}
                  />
                </Pressable>
              </Animated.View>
            ) : null}
          </XStack>

          {showActions ? (
            <Animated.View entering={ZoomIn.duration(200)}>
              <XStack gap={6} alignSelf={isUser ? "flex-end" : "flex-start"} paddingHorizontal={4}>
                <Pressable
                  onPress={() => {
                    onCopy(msg.content ?? "");
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
                  <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                    Copy
                  </Text>
                </Pressable>
              </XStack>
            </Animated.View>
          ) : null}
        </YStack>
      </XStack>

      {!isUser && deletionItems?.length ? (
        <DeletionProposalCard items={deletionItems} token={token} />
      ) : null}
      {!isUser && cardIds?.length ? (
        <SearchResultsCard
          ids={cardIds}
          isCached={cardIsCached ?? false}
          turns={cardTurns}
          flow={cardFlow}
          token={token}
          calendarSyncEnabled={calendarSyncEnabled}
          onDeepSearch={onDeepSearch ? (query) => onDeepSearch(msg._id, query) : undefined}
          onEdit={onEditMemory}
        />
      ) : null}
    </Animated.View>
  );
});
