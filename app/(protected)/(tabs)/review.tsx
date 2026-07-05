import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHero } from "@/components/ui/PageHero";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useSemanticColors } from "@/hooks/useSemanticColors";

// ─── Types ───────────────────────────────────────────────────────────────────

type ReviewCard = Doc<"reviewCards"> & { memory: Doc<"memories"> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a future ISO date string as relative time */
function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const target = new Date(isoDate).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) return "now";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays}d`;
}

/** SM-2 next interval preview given current card state + proposed quality */
function previewInterval(card: ReviewCard, quality: number): number {
  let ef = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;
  if (quality < 3) return 1;
  if (card.repetitions === 0) return 1;
  if (card.repetitions === 1) return 6;
  return Math.round(card.intervalDays * ef);
}

const RATING_DEFS = [
  { label: "Again", emoji: "🔴", quality: 1, tone: "again" },
  { label: "Hard", emoji: "🟡", quality: 2, tone: "hard" },
  { label: "Good", emoji: "🔵", quality: 3, tone: "good" },
  { label: "Easy", emoji: "🟢", quality: 5, tone: "easy" },
] as const;

type RatingOption = (typeof RATING_DEFS)[number] & { color: string };

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Progress bar */
function ProgressBar({ progress }: { progress: number }) {
  const theme = useAppTheme();
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.min(progress, 1), { duration: 400 });
  }, [progress]);
  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }));
  return (
    <YStack
      width="100%"
      height={6}
      borderRadius={999}
      overflow="hidden"
      marginBottom={12}
      backgroundColor={theme.borderColor.val + "60"}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 999, backgroundColor: theme.primary.val },
          barStyle,
        ]}
      />
    </YStack>
  );
}

/** Front face of the flashcard */
function CardFront({
  card,
  cardCount,
  cardIndex,
}: {
  card: ReviewCard;
  cardCount: number;
  cardIndex: number;
}) {
  const theme = useAppTheme();
  return (
    <YStack flex={1} justifyContent="space-between" padding={22}>
      <XStack justifyContent="space-between" alignItems="center">
        <Badge label="Question" tone="primary" />
        <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
          {cardIndex + 1} / {cardCount}
        </Text>
      </XStack>

      <YStack flex={1} justifyContent="center" alignItems="center" paddingVertical={16}>
        <Text
          fontSize={22}
          fontFamily="$heading"
          fontWeight="700"
          textAlign="center"
          color={theme.color.val}
          lineHeight={30}
          marginBottom={20}
        >
          {card.memory.title}
        </Text>
        <XStack
          alignItems="center"
          gap={6}
          paddingHorizontal={18}
          paddingVertical={8}
          borderRadius={999}
          backgroundColor={theme.primary.val + "14"}
        >
          <Feather name="eye" size={14} color={theme.primary.val} />
          <Text fontSize={13} fontFamily="$body" color={theme.primary.val} fontWeight="600">
            Tap to reveal answer
          </Text>
        </XStack>
      </YStack>

      <XStack gap={8} justifyContent="center">
        {card.memory.lifeArea && (
          <XStack
            paddingHorizontal={10}
            paddingVertical={4}
            borderRadius={999}
            backgroundColor={theme.primary.val + "15"}
          >
            <Text fontSize={11} fontFamily="$body" color={theme.primary.val}>
              {card.memory.lifeArea}
            </Text>
          </XStack>
        )}
      </XStack>
    </YStack>
  );
}

/** Back face of the flashcard */
function CardBack({ card }: { card: ReviewCard }) {
  const theme = useAppTheme();
  return (
    <YStack flex={1} justifyContent="space-between" padding={22}>
      <XStack justifyContent="space-between" alignItems="center">
        <Badge label="Answer" tone="success" />
        <XStack alignItems="center" gap={4}>
          <Feather name="refresh-cw" size={12} color={theme.colorMuted.val} />
          <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
            {Math.round(card.intervalDays)}d interval
          </Text>
        </XStack>
      </XStack>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, marginVertical: 12 }}
        contentContainerStyle={{ paddingVertical: 4 }}
      >
        <Text
          fontSize={17}
          fontFamily="$heading"
          fontWeight="700"
          textAlign="center"
          color={theme.color.val}
          lineHeight={24}
          marginBottom={14}
        >
          {card.memory.title}
        </Text>
        {card.memory.content ? (
          <Text
            fontSize={14}
            fontFamily="$body"
            textAlign="center"
            lineHeight={22}
            color={theme.color.val}
          >
            {card.memory.content}
          </Text>
        ) : (
          <Text
            fontSize={13}
            fontFamily="$body"
            textAlign="center"
            color={theme.colorMuted.val}
            fontStyle="italic"
          >
            No additional content stored.
          </Text>
        )}
      </ScrollView>

      <XStack gap={6} justifyContent="center" flexWrap="wrap">
        {card.memory.lifeArea && (
          <XStack
            paddingHorizontal={10}
            paddingVertical={4}
            borderRadius={999}
            backgroundColor={theme.primary.val + "15"}
          >
            <Text fontSize={11} fontFamily="$body" color={theme.primary.val}>
              {card.memory.lifeArea}
            </Text>
          </XStack>
        )}
        {card.memory.importance && (
          <XStack
            paddingHorizontal={10}
            paddingVertical={4}
            borderRadius={999}
            backgroundColor={theme.secondary.val}
          >
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
              importance: {card.memory.importance}
            </Text>
          </XStack>
        )}
      </XStack>
    </YStack>
  );
}

/** A single rating button with interval preview */
function RatingButton({
  rating,
  card,
  onPress,
}: {
  rating: RatingOption;
  card: ReviewCard;
  onPress: () => void;
}) {
  const days = previewInterval(card, rating.quality);
  const preview = days === 1 ? "1d" : `${days}d`;
  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.ratingButton,
        {
          backgroundColor: rating.color + "18",
          borderColor: rating.color + "35",
        },
      ]}
    >
      <Text fontSize={18} marginBottom={2}>
        {rating.emoji}
      </Text>
      <Text fontSize={13} fontFamily="$heading" fontWeight="700" style={{ color: rating.color }}>
        {rating.label}
      </Text>
      <Text fontSize={10} fontFamily="$body" style={{ color: rating.color + "AA" }}>
        +{preview}
      </Text>
    </PressableScale>
  );
}

/** Session complete celebration screen */
function SessionComplete({
  totalReviewed,
  onReset,
}: {
  totalReviewed: number;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  return (
    <YStack
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <YStack alignItems="center" gap={12} width="100%">
        <YStack
          width={80}
          height={80}
          borderRadius={40}
          alignItems="center"
          justifyContent="center"
          backgroundColor={theme.primary.val + "20"}
          marginBottom={8}
        >
          <Text fontSize={36}>🎉</Text>
        </YStack>
        <Text
          fontSize={28}
          fontFamily="$heading"
          fontWeight="700"
          color={theme.color.val}
          textAlign="center"
        >
          Session complete!
        </Text>
        <Text
          fontSize={15}
          fontFamily="$body"
          color={theme.colorMuted.val}
          textAlign="center"
          lineHeight={22}
        >
          You reviewed {totalReviewed} {totalReviewed === 1 ? "card" : "cards"} this session.{"\n"}
          Great work keeping your memories sharp.
        </Text>

        <Card style={{ width: "100%", marginTop: 16 }}>
          <XStack justifyContent="space-around">
            <YStack alignItems="center" gap={4}>
              <Text fontSize={28} fontFamily="$heading" fontWeight="800" color={theme.primary.val}>
                {totalReviewed}
              </Text>
              <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
                Reviewed
              </Text>
            </YStack>
            <YStack width={1} backgroundColor={theme.borderColor.val} />
            <YStack alignItems="center" gap={4}>
              <Text fontSize={28} fontFamily="$heading" fontWeight="800" color={theme.success.val}>
                ✓
              </Text>
              <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
                All done
              </Text>
            </YStack>
          </XStack>
        </Card>

        <PressableScale
          onPress={onReset}
          style={[styles.resetButton, { backgroundColor: theme.primary.val }]}
        >
          <Feather name="refresh-cw" size={16} color={theme.textInverse.val} />
          <Text
            fontSize={15}
            fontFamily="$body"
            fontWeight="700"
            color={theme.textInverse.val}
            marginLeft={8}
          >
            Check for more
          </Text>
        </PressableScale>
      </YStack>
    </YStack>
  );
}

/** Upcoming card row */
function UpcomingRow({ card }: { card: ReviewCard }) {
  const theme = useAppTheme();
  const relTime = formatRelativeTime(card.nextReviewAt);
  return (
    <Card style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
      <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
        <YStack flex={1} gap={6}>
          <Text
            fontSize={15}
            fontFamily="$body"
            fontWeight="600"
            color={theme.color.val}
            numberOfLines={2}
          >
            {card.memory.title}
          </Text>
          <XStack gap={6} alignItems="center">
            {card.memory.lifeArea && (
              <XStack
                paddingHorizontal={8}
                paddingVertical={3}
                borderRadius={999}
                backgroundColor={theme.primary.val + "14"}
              >
                <Text fontSize={10} fontFamily="$body" color={theme.primary.val}>
                  {card.memory.lifeArea}
                </Text>
              </XStack>
            )}
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
              {Math.round(card.intervalDays)}d interval
            </Text>
          </XStack>
        </YStack>
        <YStack alignItems="flex-end" gap={4}>
          <XStack
            paddingHorizontal={10}
            paddingVertical={5}
            borderRadius={999}
            backgroundColor={theme.primary.val + "18"}
            alignItems="center"
            gap={4}
          >
            <Feather name="clock" size={11} color={theme.primary.val} />
            <Text fontSize={11} fontFamily="$body" fontWeight="600" color={theme.primary.val}>
              {relTime}
            </Text>
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReviewScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { token } = useAuth();
  const tabBarPadding = useTabBarBottomPadding();
  const ratings = useMemo<RatingOption[]>(
    () =>
      RATING_DEFS.map((rating) => ({
        ...rating,
        color: semantic.reviewQuality[rating.tone],
      })),
    [
      semantic.reviewQuality.again,
      semantic.reviewQuality.easy,
      semantic.reviewQuality.good,
      semantic.reviewQuality.hard,
    ],
  );

  const dueCards = useQuery(api.review.getDue, token ? { token, limit: 50 } : "skip") ?? [];
  const allCards = useQuery(api.review.list, token ? { token, limit: 100 } : "skip") ?? [];
  const reviewCard = useMutation(api.review.review);
  const removeFromReview = useMutation(api.review.removeFromReview);

  // Stable session queue — built once when dueCards first loads (non-empty)
  const [sessionQueue, setSessionQueue] = useState<ReviewCard[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionRatings, setSessionRatings] = useState<number[]>([]);
  const [sessionDone, setSessionDone] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reveal animation (opacity crossfade — works on all platforms)
  const frontOpacity = useSharedValue(1);
  const backOpacity = useSharedValue(0);

  const frontStyle = useAnimatedStyle(() => ({ opacity: frontOpacity.value }));
  const backStyle = useAnimatedStyle(() => ({ opacity: backOpacity.value }));

  // Lock session queue in once dueCards is available and the queue is empty
  const queueLocked = useRef(false);
  useEffect(() => {
    if (!queueLocked.current && dueCards.length > 0) {
      setSessionQueue([...dueCards]);
      setSessionIndex(0);
      setSessionRatings([]);
      setSessionDone(false);
      setIsRevealed(false);
      frontOpacity.value = 1;
      backOpacity.value = 0;
      queueLocked.current = true;
    }
  }, [dueCards]);

  const currentCard = sessionQueue[sessionIndex] ?? null;

  // Upcoming = cards not yet due, sorted by soonest
  const upcomingCards = useMemo(() => {
    const nowIso = new Date().toISOString();
    return allCards
      .filter((c) => c.nextReviewAt > nowIso)
      .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
      .slice(0, 5);
  }, [allCards]);

  const handleReveal = useCallback(() => {
    if (isRevealed || !currentCard) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    frontOpacity.value = withTiming(0, { duration: 220 });
    backOpacity.value = withTiming(1, { duration: 280 });
    setIsRevealed(true);
  }, [isRevealed, currentCard]);

  const handleRate = useCallback(
    async (quality: number) => {
      if (!currentCard || isSubmitting) return;
      setIsSubmitting(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        await reviewCard({ token: token!, cardId: currentCard._id, quality });
      } catch {
        // swallow — optimistic UX continues
      }

      const newRatings = [...sessionRatings, quality];
      setSessionRatings(newRatings);

      const nextIndex = sessionIndex + 1;
      if (nextIndex >= sessionQueue.length) {
        setSessionDone(true);
      } else {
        setSessionIndex(nextIndex);
        setIsRevealed(false);
        frontOpacity.value = withTiming(1, { duration: 200 });
        backOpacity.value = withTiming(0, { duration: 160 });
      }
      setIsSubmitting(false);
    },
    [currentCard, isSubmitting, sessionRatings, sessionIndex, sessionQueue, token, reviewCard],
  );

  const handleRemove = useCallback(() => {
    if (!currentCard) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeFromReview({ token: token!, memoryId: currentCard.memoryId });
    // advance past this card in session
    const next = sessionIndex + 1;
    if (next >= sessionQueue.length) {
      setSessionDone(true);
    } else {
      setSessionIndex(next);
      setIsRevealed(false);
      frontOpacity.value = withTiming(1, { duration: 200 });
      backOpacity.value = withTiming(0, { duration: 160 });
    }
  }, [currentCard, sessionIndex, sessionQueue, token, removeFromReview]);

  const handleStartNewSession = useCallback(() => {
    // Re-lock with fresh dueCards
    queueLocked.current = false;
    setSessionQueue([]);
    setSessionDone(false);
    setSessionIndex(0);
    setSessionRatings([]);
    setIsRevealed(false);
    frontOpacity.value = 1;
    backOpacity.value = 0;
    // useEffect will pick up fresh dueCards
  }, []);

  const progress =
    sessionQueue.length > 0 ? (sessionIndex + (isRevealed ? 1 : 0)) / sessionQueue.length : 0;

  const isLoading = dueCards === undefined || allCards === undefined;

  return (
    <YStack flex={1} backgroundColor={theme.background.val}>
      {/* ── Header ─────────────────────────────────────────── */}
      <YStack paddingHorizontal={16} paddingTop={12} paddingBottom={4}>
        <PageHero
          eyebrow="Spaced repetition"
          title="Review queue"
          description="Reveal each card, rate your recall, and let SM-2 schedule the next review."
          icon="refresh-cw"
        />

        {/* Progress bar — only show when session is active */}
        {sessionQueue.length > 0 && !sessionDone && <ProgressBar progress={progress} />}
      </YStack>

      {/* ── Body ───────────────────────────────────────────── */}
      {sessionDone ? (
        /* ── Session complete ── */
        <SessionComplete totalReviewed={sessionRatings.length} onReset={handleStartNewSession} />
      ) : sessionQueue.length === 0 || !currentCard ? (
        /* ── Nothing due / empty ── */
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingBottom: tabBarPadding,
          }}
          showsVerticalScrollIndicator={false}
        >
          <EmptyState
            icon="check-circle"
            title={allCards.length > 0 ? "All caught up!" : "No cards queued"}
            description={
              allCards.length > 0
                ? "You have no cards due right now. Your upcoming schedule is below."
                : "Add memories to your review queue from the home screen."
            }
          />
          {upcomingCards.length > 0 && (
            <YStack gap={10} marginTop={8}>
              <Text
                fontSize={16}
                fontFamily="$heading"
                fontWeight="700"
                color={theme.color.val}
                marginBottom={4}
              >
                Upcoming
              </Text>
              {upcomingCards.map((card) => (
                <YStack key={card._id}>
                  <UpcomingRow card={card} />
                </YStack>
              ))}
            </YStack>
          )}
        </ScrollView>
      ) : (
        /* ── Active session ── */
        <YStack flex={1} alignItems="center" paddingHorizontal={16} paddingBottom={tabBarPadding}>
          {/* Flashcard */}
          <YStack
            width="100%"
            style={{ flex: 1, maxHeight: 380, position: "relative" }}
            marginBottom={16}
          >
            {/* Front */}
            <Animated.View
              pointerEvents={isRevealed ? "none" : "auto"}
              style={[StyleSheet.absoluteFill, frontStyle]}
            >
              <PressableScale onPress={handleReveal} style={{ flex: 1 }}>
                <Card style={{ flex: 1 }} noPadding>
                  <CardFront
                    card={currentCard}
                    cardCount={sessionQueue.length}
                    cardIndex={sessionIndex}
                  />
                </Card>
              </PressableScale>
            </Animated.View>

            {/* Back */}
            <Animated.View
              pointerEvents={isRevealed ? "auto" : "none"}
              style={[StyleSheet.absoluteFill, backStyle]}
            >
              <Card style={{ flex: 1 }} noPadding>
                <CardBack card={currentCard} />
              </Card>
            </Animated.View>
          </YStack>

          {/* Rating buttons */}
          {isRevealed && (
            <YStack width="100%">
              <Text
                fontSize={12}
                fontFamily="$body"
                color={theme.colorMuted.val}
                textAlign="center"
                marginBottom={10}
              >
                How well did you remember this?
              </Text>
              <XStack gap={8} width="100%">
                {ratings.map((r) => (
                  <RatingButton
                    key={r.label}
                    rating={r}
                    card={currentCard}
                    onPress={() => handleRate(r.quality)}
                  />
                ))}
              </XStack>
            </YStack>
          )}

          {/* Remove from queue */}
          <Animated.View entering={FadeIn.delay(200).duration(300)} style={{ marginTop: 14 }}>
            <PressableScale
              onPress={handleRemove}
              style={[
                styles.removeButton,
                {
                  borderColor: theme.borderColor.val,
                  backgroundColor: theme.card.val,
                },
              ]}
            >
              <Feather name="x-circle" size={15} color={theme.colorMuted.val} />
              <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val} marginLeft={6}>
                Remove from queue
              </Text>
            </PressableScale>
          </Animated.View>
        </YStack>
      )}
    </YStack>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  ratingButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    gap: 2,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 8,
    width: "100%",
  },
});
