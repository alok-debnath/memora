import React, { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  FadeInUp,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function ReviewScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();

  const dueCards = useQuery(api.review.getDue, token ? { token, limit: 25 } : "skip") ?? [];
  const allCards = useQuery(api.review.list, token ? { token, limit: 100 } : "skip") ?? [];
  const reviewCard = useMutation(api.review.review);
  const removeFromReview = useMutation(api.review.removeFromReview);

  const [isRevealed, setIsRevealed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    if (currentIndex >= dueCards.length) {
      setCurrentIndex(Math.max(dueCards.length - 1, 0));
      setIsRevealed(false);
      flipProgress.value = withTiming(0, { duration: 120 });
    }
  }, [currentIndex, dueCards.length, flipProgress]);

  const currentCard = dueCards[currentIndex];
  const nextUp = useMemo(() => {
    const nowIso = new Date().toISOString();
    return allCards
      .filter((card) => card.nextReviewAt > nowIso)
      .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
      .slice(0, 3);
  }, [allCards]);

  const handleReveal = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    flipProgress.value = withTiming(1, { duration: 360 });
    setIsRevealed(true);
  };

  const handleRate = (quality: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (currentCard) {
      reviewCard({ token: token!, cardId: currentCard._id, quality });
    }
    flipProgress.value = withTiming(0, { duration: 260 });
    setIsRevealed(false);
    setCurrentIndex((index) => (index < dueCards.length - 1 ? index + 1 : 0));
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipProgress.value, [0, 1], [0, 180])}deg` }],
    backfaceVisibility: "hidden" as const,
    opacity: flipProgress.value > 0.5 ? 0 : 1,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipProgress.value, [0, 1], [180, 360])}deg` }],
    backfaceVisibility: "hidden" as const,
    opacity: flipProgress.value > 0.5 ? 1 : 0,
  }));

  const ratings = [
    { label: "Again", quality: 1, color: "#EF4444" },
    { label: "Hard", quality: 2, color: "#F59E0B" },
    { label: "Good", quality: 3, color: "#3B82F6" },
    { label: "Easy", quality: 5, color: "#10B981" },
  ];
  const progress = dueCards.length > 0 ? (currentIndex + (isRevealed ? 1 : 0)) / dueCards.length : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top", "bottom"]}>
      <YStack flex={1} paddingHorizontal={16} backgroundColor="$background" paddingTop={12}>
        <Animated.View entering={FadeInUp.duration(400)}>
        <Card
          style={{
            marginBottom: 14,
            padding: 18,
            borderRadius: 24,
            backgroundColor: theme.card.val,
          }}
        >
          <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={6}>
              <Badge label="Spaced repetition" color={theme.primary.val} />
              <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                Review queue
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                Triage the memories that matter most. Reveal the card, rate it, and move on.
              </Text>
            </YStack>
            <YStack
              width={52}
              height={52}
              borderRadius={18}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.primary.val + "18"}
            >
              <Feather name="refresh-cw" size={22} color={theme.primary.val} />
            </YStack>
          </XStack>
          <XStack gap={10} marginTop={16}>
            <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
              <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                {dueCards.length}
              </Text>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                due now
              </Text>
            </Card>
            <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
              <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                {allCards.length}
              </Text>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                in queue
              </Text>
            </Card>
          </XStack>
        </Card>
        {dueCards.length > 0 && (
          <YStack width="100%" height={8} borderRadius={999} overflow="hidden" marginBottom={12} backgroundColor="$borderColor">
            <YStack height="100%" borderRadius={999} backgroundColor="$primary" width={`${Math.min(progress * 100, 100)}%`} />
          </YStack>
        )}
      </Animated.View>

        {dueCards.length === 0 || !currentCard ? (
        <>
          <EmptyState
            icon="check-circle"
            title={allCards.length > 0 ? "No cards due" : "No cards queued"}
            description={
              allCards.length > 0
                ? "You are caught up for now. Upcoming reviews are listed below."
                : "Add memories to your review queue from the home screen, or check back later."
            }
          />
          {nextUp.length > 0 && (
            <YStack width="100%" paddingTop={10} gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="600" color="$color">
                Upcoming
              </Text>
              <YStack gap={10}>
                {nextUp.map((card) => (
                  <Card key={card._id} style={{ paddingVertical: 14 }}>
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={8}>
                      <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                        {new Date(card.nextReviewAt).toLocaleDateString()}
                      </Text>
                    </XStack>
                    <Text fontSize={15} fontFamily="$body" fontWeight="500" color="$color" numberOfLines={1}>
                      {card.memory.title}
                    </Text>
                  </Card>
                ))}
              </YStack>
            </YStack>
          )}
        </>
        ) : (
        <YStack flex={1} alignItems="center" justifyContent="center" paddingBottom={24}>
          <YStack width="100%" maxWidth={400} height={320} position="relative">
            <Animated.View style={[{ position: "absolute", width: "100%", height: "100%" }, frontStyle]}>
              <PressableScale onPress={handleReveal} style={{ flex: 1 }}>
                <Card style={{ flex: 1, justifyContent: "space-between" }}>
                  <XStack justifyContent="flex-end" alignItems="center">
                    <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                      {currentIndex + 1}/{dueCards.length}
                    </Text>
                  </XStack>
                  <YStack flex={1} justifyContent="center" alignItems="center" paddingVertical={20}>
                    <Text
                      fontSize={21}
                      fontFamily="$heading"
                      fontWeight="600"
                      textAlign="center"
                      marginBottom={12}
                      color="$color"
                    >
                      {currentCard.memory.title}
                    </Text>
                    <XStack alignItems="center" gap={6} marginTop={12}>
                      <Feather name="eye" size={16} color={theme.colorMuted.val} />
                      <Text fontSize={13} fontFamily="$body" color="$colorMuted">
                        Tap to reveal
                      </Text>
                    </XStack>
                  </YStack>
                </Card>
              </PressableScale>
            </Animated.View>

            <Animated.View style={[{ position: "absolute", width: "100%", height: "100%" }, backStyle]}>
              <Card style={{ flex: 1, justifyContent: "space-between" }}>
                <XStack />
                <YStack flex={1} justifyContent="center" alignItems="center" paddingVertical={18}>
                  <Text
                    fontSize={21}
                    fontFamily="$heading"
                    fontWeight="600"
                    textAlign="center"
                    marginBottom={12}
                    color="$color"
                  >
                    {currentCard.memory.title}
                  </Text>
                  <Text
                    fontSize={15}
                    fontFamily="$body"
                    textAlign="center"
                    lineHeight={22}
                    marginBottom={12}
                    color="$color"
                  >
                    {currentCard.memory.content}
                  </Text>
                  <Text fontSize={12} fontFamily="$body" marginTop={10} color="$colorMuted">
                    Interval {Math.round(currentCard.intervalDays)} day
                    {Math.round(currentCard.intervalDays) === 1 ? "" : "s"}
                  </Text>
                </YStack>
              </Card>
            </Animated.View>
          </YStack>

          {isRevealed && (
            <Animated.View entering={FadeInUp.delay(200).duration(300)} style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              {ratings.map((r) => (
                <PressableScale
                  key={r.label}
                  onPress={() => handleRate(r.quality)}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 14,
                      alignItems: "center",
                      borderWidth: 1,
                    },
                    { backgroundColor: r.color + "15", borderColor: r.color + "30" },
                  ]}
                >
                  <Text fontSize={14} fontFamily="$heading" fontWeight="600" style={{ color: r.color }}>
                    {r.label}
                  </Text>
                </PressableScale>
              ))}
            </Animated.View>
          )}

          <PressableScale
            onPress={() => {
              if (!currentCard) return;
              removeFromReview({ token: token!, memoryId: currentCard.memoryId });
              setIsRevealed(false);
              flipProgress.value = withTiming(0, { duration: 150 });
            }}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
              },
              { borderColor: theme.borderColor.val, backgroundColor: theme.card.val },
            ]}
          >
            <Feather name="x-circle" size={16} color={theme.colorMuted.val} />
            <Text fontSize={13} fontFamily="$body" color="$colorMuted">
              Remove from queue
            </Text>
          </PressableScale>
        </YStack>
        )}
      </YStack>
    </SafeAreaView>
  );
}
