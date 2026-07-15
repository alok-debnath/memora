import { useEffect, useRef, useState } from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const STREAM_REVEAL_INTERVAL_MS = 48;
// Server patches land every ~400ms (STREAM_PATCH_INTERVAL_MS in
// convex/lib/chat/budgets.ts); pace each backlog across that window so the
// reveal drains right as the next patch arrives instead of using fixed steps.
const STREAM_SERVER_PATCH_MS = 400;
const STREAM_TICKS_PER_PATCH = Math.max(
  1,
  Math.round(STREAM_SERVER_PATCH_MS / STREAM_REVEAL_INTERVAL_MS),
);
const STREAM_MIN_CHARS_PER_TICK = 3;
// Past this backlog the typewriter is theater, not feedback \u2014 flush instantly
// (finalize dumps and non-streaming providers hit this).
const STREAM_FLUSH_THRESHOLD_CHARS = 1200;

export const STREAM_CURSOR = "\u2060\u2502";

function getStreamRevealStep(remaining: number, catchUp: boolean) {
  const paced = Math.ceil(remaining / STREAM_TICKS_PER_PATCH);
  const step = catchUp ? Math.max(paced, Math.ceil(remaining / 3)) : paced;
  return Math.min(remaining, Math.max(STREAM_MIN_CHARS_PER_TICK, step));
}

export function useStreamReveal(content: string, isStreaming: boolean) {
  const [visibleText, setVisibleText] = useState(() => (isStreaming ? "" : content));
  const [isRevealing, setIsRevealing] = useState(isStreaming);
  const visibleRef = useRef(isStreaming ? "" : content);
  const targetRef = useRef(content);
  const hasStreamedRef = useRef(isStreaming);

  useEffect(() => {
    targetRef.current = content;

    if (isStreaming) {
      hasStreamedRef.current = true;
      setIsRevealing(visibleRef.current !== content);
    }

    if (!isStreaming && !hasStreamedRef.current) {
      visibleRef.current = content;
      setVisibleText(content);
      setIsRevealing(false);
      return;
    }

    if (!content.startsWith(visibleRef.current)) {
      visibleRef.current = content;
      setVisibleText(content);
      setIsRevealing(false);
      return;
    }

    if (visibleRef.current !== content) {
      setIsRevealing(true);
    }
  }, [content, isStreaming]);

  useEffect(() => {
    if (!isStreaming && visibleRef.current === targetRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      const target = targetRef.current;
      const current = visibleRef.current;
      if (current === target) {
        setIsRevealing(false);
        return;
      }

      const remaining = target.length - current.length;
      if (
        remaining <= 0 ||
        !target.startsWith(current) ||
        remaining > STREAM_FLUSH_THRESHOLD_CHARS
      ) {
        visibleRef.current = target;
        setVisibleText(target);
        setIsRevealing(false);
        return;
      }

      // Stream ended: drain the leftover backlog fast instead of at trickle pace.
      const step = getStreamRevealStep(remaining, !isStreaming);
      const next = target.slice(0, current.length + step);
      visibleRef.current = next;
      setVisibleText(next);
      setIsRevealing(next !== target);
      timer = setTimeout(tick, STREAM_REVEAL_INTERVAL_MS);
    };

    timer = setTimeout(tick, STREAM_REVEAL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [content, isStreaming]);

  return { visibleText, isRevealing };
}

export function useStreamRevealMotion(revealKey: string | number, enabled: boolean) {
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, { duration: 130 });
  }, [enabled, progress, revealKey]);

  return useAnimatedStyle(() => {
    if (!enabled) {
      return {
        opacity: 1,
      };
    }

    return {
      opacity: 0.92 + progress.value * 0.08,
    };
  });
}
