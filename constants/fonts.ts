/**
 * Single source of truth for font family names.
 * Update here to change the app font everywhere.
 *
 * Used in:
 *  - app/_layout.tsx  → useFonts() loading
 *  - tamagui.config.ts → createFont() face mapping
 *  - StyleSheet / TextInput style props throughout the app
 *
 * Tamagui <Text> components should use $body / $heading tokens instead.
 */
export const FontFamily = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semiBold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
} as const;

/** Convenience array for useFonts() — import the expo asset objects separately. */
export type FontFamilyKey = keyof typeof FontFamily;
