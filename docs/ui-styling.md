# UI Styling Guide

Memora now treats Tamagui as the primary styling system for app UI.

## Default Rules

- Use `useAppTheme()` for semantic color access.
- Build new screens from shared primitives before reaching for raw layout code:
  - `AppButton`
  - `AppTextField`
  - `SurfaceCard`
  - `Badge`
  - `InlineNotice`
  - `AppScreen` / `SectionCard`
- Prefer semantic variants and tones over passing arbitrary colors.
- Keep gradients centralized in `constants/colors.ts`.

## Allowed `StyleSheet` Usage

- animation helpers
- `StyleSheet.absoluteFill`
- third-party React Native interop
- SVG/canvas/chart geometry
- platform-specific layout edge cases

## Avoid

- raw hex or `rgba(...)` literals inside shared UI/auth components
- screen-local button/input/badge/card styling when a shared primitive exists
- duplicating light/dark palettes outside `tamagui.config.ts`

## Current Enforcement Scope

The lightweight check currently covers:

- the standardized primitives in `components/ui`
- `components/auth/AuthShell.tsx`
- `app/(public)/(auth)`
- selected migrated navigation shells

Expand the scope as more screens are migrated to the shared system.
