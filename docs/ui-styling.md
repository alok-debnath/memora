# UI Styling Guide

Memora now treats Tamagui as the primary styling system for app UI.

## Default Rules

- Use `useAppTheme()` for semantic color access.
- Use `constants/uiTokens.ts` (`spacing`, `radius`) instead of ad hoc numeric literals for padding, gaps, and border radius.
- Build new screens from shared primitives before reaching for raw layout code:
  - `AppScreen` (page scaffold — supports `hero`, `showBack`, `noScroll`) / `SectionCard`
  - `PageHero` (screen title/eyebrow/description, optional `stats` row via `StatStrip`)
  - `AppButton`
  - `AppTextField`
  - `SurfaceCard`
  - `Badge`
  - `InlineNotice`
- Every screen should have exactly one title/header block. Don't hand-roll a second "hero card" on top of `AppScreen`'s own title/back row — pass `title`/`hero` to `AppScreen` instead.
- Prefer semantic variants and tones over passing arbitrary colors.
- Keep palette generation and gradients centralized in `constants/themePalettes.ts`.

## Allowed `StyleSheet` Usage

- animation helpers
- `StyleSheet.absoluteFill`
- third-party React Native interop
- SVG/canvas/chart geometry
- platform-specific layout edge cases

## Avoid

- raw hex or `rgba(...)` literals inside shared UI/auth components
- screen-local button/input/badge/card styling when a shared primitive exists
- duplicating light/dark palettes outside `constants/themePalettes.ts`

## Current Enforcement Scope

The lightweight check currently covers:

- the standardized primitives in `components/ui`
- `components/auth/AuthShell.tsx`
- `app/(public)/(auth)`
- all `app/(protected)/*` screens except `app/(protected)/admin/*` (a separate desktop-console shell, `AdminLayoutShell`, using `MorePageScaffold`)

Expand the scope as more screens are migrated to the shared system.
