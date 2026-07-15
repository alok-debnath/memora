import { Easing } from "react-native-reanimated";

/**
 * Memora motion is deliberately quiet. Timing communicates hierarchy while
 * springs are reserved for direct manipulation (sheets, drags, review cards).
 */
export const motion = {
  pressIn: { duration: 80 },
  pressOut: { duration: 120 },
  selection: { duration: 190, easing: Easing.out(Easing.cubic) },
  content: { duration: 180, easing: Easing.out(Easing.quad) },
  overlay: { duration: 240, easing: Easing.out(Easing.cubic) },
  settleSpring: {
    damping: 28,
    stiffness: 260,
    mass: 0.85,
    overshootClamping: true,
  },
} as const;
