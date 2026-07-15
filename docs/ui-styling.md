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

## Responsive Layout

- Use `useResponsiveLayout()` instead of screen-local breakpoint checks:
  - compact: `<600px` — floating bottom navigation and single-column content
  - medium: `600–1023px` — icon rail and adaptive content
  - expanded: `1024–1279px` — sectioned sidebar
  - wide: `>=1280px` — sectioned sidebar, workspace layouts, and docked chat
- Use `AppScreen` content widths (`readable`, `standard`, `workspace`, `full`) and the shared
  container-measured `WorkspaceSplit`, `SectionGrid`, and `ResponsiveStatGrid` primitives before
  adding custom width math. `AdaptiveGrid` / `AdaptiveSplit` remain compatibility aliases.
- Protected pages use the `standard` 1120px frame by default. Headers, scroll bodies, and
  virtualized-list viewports must share that frame; narrower reading or focus lanes belong inside
  it and must not redefine the page's outer alignment.
- Derive grids from their available container width. Do not read `Dimensions` at module load;
  it does not react correctly to web resizing or orientation changes.
- Native supports portrait and landscape. Layout changes must not discard navigation, form,
  list-scroll, or open-surface state.
- `showBack` is adaptive: compact stack pages receive the mobile floating back header, while
  rail/sidebar pages receive a section-aware workspace header without a redundant back action.

## Visual System

- Space Grotesk is the display face. DM Sans handles body, control, metadata, numeric, and
  operational UI; the `$utility` token is an alias to DM Sans for semantic clarity.
- Neutral surfaces use Memora's cool archive palette; the selected user accent controls focus and
  selection without recoloring every neutral surface.
- Web interactions require visible keyboard focus, appropriate cursors, hover/pressed feedback,
  and keyboard-reachable actions. Respect reduced motion and animate transforms/opacity only.

## Selection Controls

- Use `SelectionTabs` for one active content view, mode, or date range. It owns the animated
  indicator, counts, compact labels, vertical desktop layout, reduced motion, and tab semantics.
- Use `FilterChipGroup` for filters that narrow the current content. Chips do not imply a page or
  content-view change and therefore do not use the sliding tab indicator.
- Use a compact `SelectionTabs` instance for mutually exclusive icon choices such as grid/list.
- Do not add screen-local tab pills, mode pills, or range selectors.

## Motion

- Use `constants/motion.ts` for standard presses, selection, content, and overlays. The floating
  primary navigation bar intentionally retains its established local spring choreography.
- Standard selection uses a short decelerating timing curve with no stretch or bounce. Springs are
  reserved for direct manipulation such as sheet settling, drags, and review-card gestures.
- Repeating rotation is not part of the app language. Progress may use a quiet opacity change and
  must become static when reduced motion is enabled.

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
