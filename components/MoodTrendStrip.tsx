import React, { useRef, useEffect } from "react";
import { ScrollView, Pressable } from "react-native";
import { Feather } from "@/lib/icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { moodColors } from "@/constants/colors";
import { moodIcons, moodLabels, type Mood } from "@/constants/categories";

interface MoodTrendEntry {
  _id: string;
  _creationTime: number;
  mood?: string;
}

interface MoodTrendStripProps {
  entries: MoodTrendEntry[];
}

function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MoodTrendStrip({ entries }: MoodTrendStripProps) {
  const theme = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);

  const withMood = entries.filter((e) => e.mood);
  if (withMood.length < 2) return null;

  // Show last 14 entries max, oldest → newest (left → right)
  const visible = [...entries].slice(-14).reverse().reverse();

  useEffect(() => {
    // Scroll to rightmost (most recent) on mount
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, []);

  return (
    <YStack marginBottom={16}>
      <Text
        fontSize={11}
        fontFamily="$body"
        color="$colorMuted"
        letterSpacing={0.8}
        marginBottom={10}
        textTransform="uppercase"
      >
        Mood trend
      </Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 2,
          gap: 12,
          flexDirection: "row",
        }}
      >
        {visible.map((entry) => {
          const mood = entry.mood as Mood | undefined;
          const color = mood ? moodColors[mood] : theme.borderColor.val;
          const icon = mood ? moodIcons[mood] : "minus";

          return (
            <YStack key={entry._id} alignItems="center" gap={4} width={52}>
              <YStack
                width={36}
                height={36}
                borderRadius={18}
                backgroundColor={color + (mood ? "20" : "40")}
                alignItems="center"
                justifyContent="center"
                borderWidth={1.5}
                borderColor={color + (mood ? "60" : "30")}
              >
                <Feather name={icon as any} size={15} color={mood ? color : theme.colorMuted.val} />
              </YStack>
              <Text
                fontSize={9}
                fontFamily="$body"
                color="$colorMuted"
                textAlign="center"
                numberOfLines={1}
              >
                {formatShortDate(entry._creationTime)}
              </Text>
              {mood && (
                <Text
                  fontSize={9}
                  fontFamily="$body"
                  fontWeight="600"
                  color={color}
                  textAlign="center"
                  numberOfLines={1}
                >
                  {moodLabels[mood]}
                </Text>
              )}
            </YStack>
          );
        })}
      </ScrollView>
    </YStack>
  );
}
