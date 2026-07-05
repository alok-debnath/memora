import React from "react";
import { ScrollView } from "react-native";
import { Feather } from "@/lib/icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { PressableScale } from "./PressableScale";
import { Text, XStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "./themeHelpers";

interface TopicPillsProps {
  selected: string | null;
  onSelect: (topicId: string | null) => void;
  topics: Array<{
    _id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    memoryCount: number;
  }>;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function TopicPills({ selected, onSelect, topics, onSync, isSyncing }: TopicPillsProps) {
  const theme = useAppTheme();

  const rotation = useSharedValue(0);

  React.useEffect(() => {
    if (isSyncing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      rotation.value = 0;
    }
  }, [isSyncing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const activeTopics = topics
    .filter((t) => t.memoryCount > 0)
    .sort((a, b) => b.memoryCount - a.memoryCount);

  if (activeTopics.length < 2) return null;

  const syncBg = theme.card.val;
  const syncBorder = theme.borderColor.val;
  const syncIconColor = theme.colorMuted.val;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: 8,
        flexDirection: "row",
      }}
    >
      {/* "All" pill */}
      <PressableScale
        onPress={() => onSelect(null)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          gap: 6,
          borderWidth: 0.5,
          backgroundColor: selected === null ? theme.primary.val : theme.secondary.val,
          borderColor: selected === null ? theme.primary.val : theme.borderColor.val,
        }}
      >
        <Text
          fontSize={13}
          fontFamily="$body"
          fontWeight="500"
          color={selected === null ? theme.textInverse.val : theme.colorMuted.val}
        >
          All
        </Text>
      </PressableScale>

      {activeTopics.map((topic) => {
        const isSelected = selected === topic._id;
        const pillColor = topic.color || theme.primary.val;

        return (
          <PressableScale
            key={topic._id}
            onPress={() => onSelect(topic._id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              gap: 6,
              borderWidth: 0.5,
              backgroundColor: isSelected ? pillColor : theme.secondary.val,
              borderColor: isSelected ? pillColor : theme.borderColor.val,
            }}
          >
            <Feather
              name={(topic.icon as React.ComponentProps<typeof Feather>["name"]) ?? "tag"}
              size={14}
              color={isSelected ? theme.textInverse.val : theme.colorMuted.val}
            />
            <Text
              fontSize={13}
              fontFamily="$body"
              fontWeight="500"
              color={isSelected ? theme.textInverse.val : theme.colorMuted.val}
            >
              {topic.name}
            </Text>
            <Text
              fontSize={11}
              fontFamily="$body"
              color={isSelected ? withAlpha(theme.textInverse.val, "B3") : theme.colorMuted.val}
            >
              {topic.memoryCount}
            </Text>
          </PressableScale>
        );
      })}

      {onSync ? (
        <PressableScale
          onPress={isSyncing ? undefined : onSync}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            gap: 6,
            borderWidth: 0.5,
            borderStyle: "dashed",
            backgroundColor: syncBg,
            borderColor: syncBorder,
            opacity: isSyncing ? 0.6 : 1,
          }}
        >
          <Animated.View style={spinStyle}>
            <Feather name="refresh-cw" size={13} color={syncIconColor} />
          </Animated.View>
          <Text fontSize={13} fontFamily="$body" fontWeight="500" color={theme.colorMuted.val}>
            {isSyncing ? "Syncing…" : "Sync"}
          </Text>
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}
