# Android Blur Implementation

This document explains how Android backdrop blur was implemented in Memora, why it was done this way, what broke during development, and how to rebuild or debug it later.

## Goal

The goal was to add a real blurred backdrop behind the custom context menu on Android while keeping:

- iOS on the native context menu path
- web on the custom context menu path
- Android on the custom context menu path with a blurred live backdrop

The important requirement was that the blur should affect the underlying app content, not just blur a local menu surface.

## High-Level Architecture

The Android blur implementation has three core pieces:

1. `BackdropBlurProvider`
2. `expo-blur` `BlurTargetView`
3. custom context-menu overlay rendering through the blur host

### 1. `BackdropBlurProvider`

File:

- [components/ui/BackdropBlurProvider.tsx](/home/alok/Documents/Projects/memora/components/ui/BackdropBlurProvider.tsx)

This provider owns a top-level overlay host and a `blurTargetRef`.

It does two things:

- wraps the app content inside `BlurTargetView`
- renders overlay nodes above the app tree from a centralized place

That is necessary because Android blur works best when the overlay is rendered outside the blurred content tree but still references the content tree as the blur target.

If the menu and the blur target are in the same local subtree without a proper host boundary, blur either looks wrong, blurs the wrong layer, or causes rendering issues.

### 2. `BlurTargetView`

The provider uses:

- `BlurTargetView` from `expo-blur`

The app UI is wrapped like this conceptually:

1. root host view
2. `BlurTargetView` containing the normal app
3. overlay layer rendered above it

This allows `BlurView` inside the custom menu overlay to point at the app content via:

- `blurTarget={blurTargetRef}`

On Android, this is the important part. Without a real blur target, the backdrop blur path is incomplete.

### 3. Context Menu Overlay

Files:

- [components/ui/ContextMenu.custom.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.custom.tsx)
- [components/ui/ContextMenu.android.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.android.tsx)
- [components/ui/ContextMenu.web.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.web.tsx)
- [components/ui/ContextMenu.ios.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.ios.tsx)
- [components/ui/ContextMenu.shared.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.shared.tsx)

The custom overlay path is used on:

- Android
- web

iOS uses the native path instead.

On Android, the overlay renders a full-screen backdrop with:

- `BlurView`
- a subtle tint layer above the blur
- a pressable dismiss surface
- the anchored menu card and preview card on top

The key Android-specific prop is:

- `blurMethod="dimezisBlurViewSdk31Plus"`

This explicitly opts into the Android blur method appropriate for recent Android versions in Expo 56.

## Root Integration

File:

- [app/_layout.tsx](/home/alok/Documents/Projects/memora/app/_layout.tsx)

`BackdropBlurProvider` is placed high in the app tree so the blur target covers the real app content and so custom overlays can render above the rest of the interface.

Provider order matters.

The current structure is effectively:

1. `TamaguiProvider`
2. `BackdropBlurProvider`
3. auth / confirm / bottom-sheet providers
4. app screens

This placement ensures:

- the overlay can access themed UI
- the blur target includes the app content users actually see
- menu overlays are not trapped inside a screen-local subtree

## Why This Was Needed Instead of a Simpler BlurView

The naive implementation is to drop a `BlurView` into the menu overlay and expect it to blur the screen behind it.

That is not reliable on Android for this use case.

The problems with the naive version were:

- the blur sometimes affected only the overlay layer itself
- the blur could look visually incorrect or not show at all
- layering was inconsistent when menu previews were rendered
- certain placements could destabilize rendering

The `BlurTargetView` + overlay host pattern fixes this by making the blur source explicit.

## Problems Encountered

### 1. Crashes / unstable rendering on Android

The first blur attempts were too direct and did not separate:

- the underlying content
- the blur target
- the overlay layer

That made the Android path unstable.

Mitigation:

- moved blur hosting into a dedicated provider
- wrapped app content in `BlurTargetView`
- rendered custom menu overlays outside the blurred subtree

### 2. Blur looked too strong

The first pass made the menu backdrop too heavy and visually noisy.

Mitigation:

- reduced blur intensity
- added a subtle tint overlay above the blur
- used separate light and dark intensities

Current constants in `ContextMenu.custom.tsx`:

- `BLUR_INTENSITY_LIGHT = 36`
- `BLUR_INTENSITY_DARK = 44`

These were intentionally kept moderate.

### 3. Menu preview card looked cramped

When the preview width was derived too aggressively from trigger size, large memory-card previews became squeezed horizontally.

Mitigation:

- introduced explicit preview width bounds
- anchored the menu and preview to the trigger rect
- clamped layout to viewport margins instead of overfitting to the trigger width

Important constants:

- `PREVIEW_MIN_WIDTH = 280`
- `PREVIEW_DEFAULT_WIDTH = 320`
- `PREVIEW_MAX_WIDTH = 380`

### 4. Overlay anchoring felt non-native

The earlier custom menu was more like a centered floating panel than a native anchored context surface.

Mitigation:

- added trigger measurement with `measureInWindow`
- stored an anchor rect
- computed top/left placement relative to available viewport space
- chose above/below trigger placement based on space
- animated from trigger rect to final anchored position

This did not affect blur correctness directly, but it materially improved perceived quality and reduced the feeling of a generic custom modal.

### 5. Theme mismatch / white surfaces in dark mode

Some surfaces still rendered too light because parts of the overlay stack were not fully using theme values.

Mitigation:

- kept menu and preview surfaces driven by theme tokens
- used theme shadow and border colors
- kept tinting subtle and mode-aware

## How the Android Blur Works at Runtime

When the user opens the Android custom context menu:

1. the trigger is measured in window coordinates
2. the overlay host is asked to render a menu overlay node
3. the overlay renders a full-screen `BlurView`
4. `BlurView` points to the top-level `blurTargetRef`
5. a tint layer is drawn above the blur for legibility
6. the anchored preview and menu card animate into place

When the user closes the menu:

1. close animation runs
2. overlay node is removed from the host
3. anchor state is cleared

This separation is important because it avoids leaving stale overlay nodes mounted longer than necessary.

## Why iOS Uses a Different Path

iOS has a native context-menu path, and using it is the correct choice for platform quality and behavior.

Files:

- [components/ui/ContextMenu.ios.tsx](/home/alok/Documents/Projects/memora/components/ui/ContextMenu.ios.tsx)

The custom Android/web implementation exists because:

- Android does not have an equivalent high-level native path in this app setup
- web needs a separate implementation anyway

So the final platform split is:

- iOS: native context menu
- Android: custom anchored menu with live blur backdrop
- web: custom anchored menu without relying on Android blur behavior

## If You Need to Rebuild This From Scratch

Rebuild in this order:

1. Add `expo-blur` support and verify the app already runs in a development build, not Expo Go.
2. Create a top-level provider that:
   - owns a `blurTargetRef`
   - wraps app content in `BlurTargetView`
   - exposes `setOverlay` / `removeOverlay`
3. Mount that provider high in `app/_layout.tsx`.
4. Keep the Android custom context menu separate from iOS native context menu.
5. In the Android custom overlay:
   - render `BlurView` full-screen
   - pass `blurTarget={blurTargetRef}`
   - use `blurMethod="dimezisBlurViewSdk31Plus"`
6. Add a tint overlay above the blur.
7. Measure the trigger rect and anchor the menu to it.
8. Clamp layout to screen margins.
9. Keep preview dimensions bounded.
10. Validate dark mode colors and readability.

## Debugging Checklist

If Android blur breaks again, check these first:

1. Is the app running in a dev build and not Expo Go?
2. Is `BackdropBlurProvider` still mounted high in `app/_layout.tsx`?
3. Is the visible app content still wrapped in `BlurTargetView`?
4. Is the overlay rendered outside the `BlurTargetView` content subtree?
5. Is `blurTarget={blurTargetRef}` still passed to `BlurView` on Android?
6. Is `blurMethod="dimezisBlurViewSdk31Plus"` still set for Android?
7. Did someone move the custom menu into a local modal/container that bypasses the overlay host?
8. Did a theme or z-index change hide the blur under an opaque layer?
9. Did a full-screen opaque background get added above the blur and below the menu card?

## Performance Notes

This implementation is intentionally scoped:

- blur is only mounted while the context menu is open
- overlay nodes are inserted and removed through a centralized host
- light and dark blur intensities are fixed constants
- layout is measured once per open interaction rather than constantly recomputed from live layout streams

That keeps the effect reasonably contained for a transient overlay.

## Tradeoffs

This is the correct practical compromise for this project:

- iOS gets the native system component
- Android gets a controlled custom implementation with real live blur
- web keeps a separate custom path

It is not a pure system-native menu on Android, but it is the best fit in this Expo app while preserving visual quality and predictable behavior.
