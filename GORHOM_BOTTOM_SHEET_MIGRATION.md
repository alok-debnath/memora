# Gorhom Bottom Sheet Migration Guide

This document explains, in detail, how the app was migrated to `@gorhom/react-native-bottom-sheet`, what architecture we ended up with, what failed during the migration, and how to rebuild the whole integration from scratch if the current changes are discarded.

The goal of this document is not just to list edits. It is to preserve the reasoning, the constraints, the implementation patterns, and the failure modes so the migration can be reproduced cleanly.

## Scope

This migration replaced the app's prior custom sheet/modal approach with Gorhom bottom sheets and then iteratively refined the implementation until the sheet architecture matched Gorhom's intended usage closely.

The work covered:

- direct use of `BottomSheetModal`
- Gorhom scrollables and text inputs
- Gorhom footer-based fixed input for chat
- large-screen detached modal presentation
- portal/provider ordering issues
- Android gesture and horizontal list polish
- removal of the old shared sheet wrapper abstraction

This document focuses on the sheets that were migrated:

- `UnifiedCommandPanel`
- `EditMemorySheet`
- `HomeOverviewSheet`
- `FilePreviewSheet`
- `TurnBreakdownSheet`
- route-local detail sheet in `app/(protected)/statistics.tsx`

## Final Principles

The final architecture follows these rules:

1. The app root provides `BottomSheetModalProvider`.
2. Each sheet is a real `BottomSheetModal`.
3. Each sheet owns its own `ref`, `present()` / `dismiss()` cycle, and `onDismiss`.
4. Sheet content uses Gorhom-aware components:
   - `BottomSheetScrollView`
   - `BottomSheetFlatList` where appropriate
   - `BottomSheetTextInput`
   - `BottomSheetFooter`
5. The chat sheet footer is not driven by context registration or a state callback loop.
6. The chat sheet uses a shared controller hook owned by the parent sheet component.
7. Large-screen detached modal layout is configured per sheet, not hidden in a generic wrapper.
8. Horizontal content inside sheets uses gesture-handler list components where that is more reliable.

## Root Setup

### Required dependency

The migration depends on:

- `@gorhom/bottom-sheet`

This also assumes the app already has:

- `react-native-reanimated`
- `react-native-gesture-handler`
- `react-native-safe-area-context`

### Babel

`babel.config.js` must include the Reanimated plugin:

```js
plugins: ["react-native-reanimated/plugin"];
```

If this is missing, Gorhom sheet behavior will be broken or unstable.

### Root provider order

`BottomSheetModalProvider` must wrap app UI at a high level, but it must also live inside the providers that sheet content depends on.

The important provider chain in `app/_layout.tsx` is:

1. `TamaguiProvider`
2. `AuthContext.Provider`
3. `AppConfirmProvider`
4. `BottomSheetModalProvider`
5. app routes / screens / global sheet host

This order matters because `BottomSheetModal` content is rendered via a portal. If the sheet portal is outside Tamagui, auth, or confirm providers, sheet content will fail at runtime.

### Runtime errors this solved

During migration we hit these provider-related failures:

- Tamagui theme context missing
- `useAuth must be used within AuthProvider`
- `useAppConfirm must be used within AppConfirmProvider`

Those were not sheet API bugs. They were portal/provider ordering bugs.

## Sheet Inventory

The migrated sheets ended up in two categories.

### Global or hosted sheets

These are mounted from `components/sheets/ProtectedSheetHost.tsx`:

- `UnifiedCommandPanel`
- `EditMemorySheet`
- `HomeOverviewSheet`
- `FilePreviewSheet`
- `TurnBreakdownSheet`

### Route-local sheet

- analytics detail sheet inside `app/(protected)/statistics.tsx`

## The Final Sheet Pattern

Every migrated sheet follows the same base lifecycle.

### Core shape

```tsx
const modalRef = useRef<BottomSheetModal>(null);
const presentedRef = useRef(false);

const handleDismiss = useCallback(() => {
  presentedRef.current = false;
  closeSheetState();
}, [closeSheetState]);

useEffect(() => {
  if (open && !presentedRef.current) {
    modalRef.current?.present();
    presentedRef.current = true;
    return;
  }

  if (!open && presentedRef.current) {
    modalRef.current?.dismiss();
  }
}, [open]);
```

Then render:

```tsx
<BottomSheetModal
  ref={modalRef}
  name="sheetName"
  index={0}
  snapPoints={[...]}
  onDismiss={handleDismiss}
>
  ...
</BottomSheetModal>
```

### Why `presentedRef` exists

`open` in app state is declarative, but `BottomSheetModal` is ref-driven.

Without `presentedRef`, it is easy to:

- call `present()` repeatedly
- call `dismiss()` when nothing is currently mounted
- create loops between `onDismiss` and local state updates

The ref acts as a guard for the modal's real mounted/open status.

## Large-Screen Detached Modal Pattern

We originally centralized this in a shared `BaseSheet`. That approach was removed because it kept sheet presentation behavior hidden behind an abstraction.

The final pattern is configured explicitly on each sheet.

### Standard detached setup

Each detached-capable sheet now owns:

- `useSafeAreaInsets()`
- `useIsLargeScreen()`

And configures:

```tsx
detached={isLargeScreen}
style={
  isLargeScreen
    ? {
        marginHorizontal: 16,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
      }
    : undefined
}
topInset={isLargeScreen ? insets.top + 16 : insets.top}
bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
```

This means:

- phone behavior stays bottom-attached
- large screens get a centered detached modal-like sheet
- layout intent is visible at the call site

### Why this is better than `BaseSheet`

The old wrapper hid:

- detached vs attached behavior
- width constraints
- safe-area math
- keyboard defaults

That made the implementation less Gorhom-native and harder to reason about. The current pattern is more verbose, but more honest.

## Scrollables and Inputs

### Required Gorhom-aware content primitives

Inside sheets:

- use `BottomSheetScrollView` for vertical scrolling surfaces
- use `BottomSheetFlatList` for sheet-aware virtualized vertical lists
- use `BottomSheetTextInput` for text input fields that participate in keyboard handling

### Where these are used

- `EditMemorySheet`
  - `BottomSheetScrollView`
  - `BottomSheetTextInput`
- `UnifiedCommandPanel`
  - `BottomSheetScrollView`
  - `BottomSheetTextInput`
- `AIChatPanel`
  - `BottomSheetFlatList`
  - `BottomSheetTextInput`
  - `BottomSheetFooter`
- `HomeOverviewSheet`
  - `BottomSheetScrollView`
- `FilePreviewSheet`
  - `BottomSheetScrollView`
- `TurnBreakdownSheet`
  - `BottomSheetScrollView`
- `statistics.tsx`
  - `BottomSheetScrollView`

### `nestedScrollEnabled`

Most sheet scrollables were given `nestedScrollEnabled`.

This was used to reduce friction in complex content trees and to avoid brittle gesture handoff when content has mixed nested layouts.

## Horizontal Content Inside Sheets

This was one of the last standards-level issues.

### Important rule

For horizontal list-like interactions inside bottom sheets, especially on Android, using gesture-handler scrollables/lists is safer than plain React Native scrollables.

### Final implementation

The remaining horizontal sheet content was moved to:

- `FlatList` from `react-native-gesture-handler`

This ended up being the right compromise for:

- flashback carousel in `HomeOverviewSheet`
- horizontal analytics timeline scroller in `statistics.tsx`

### Why this matters

Using plain RN horizontal scrollables inside a pan-driven bottom sheet can lead to:

- gesture conflicts
- poor horizontal scroll capture
- sticky or jittery dragging on Android

## Chat Sheet: Final Clean Architecture

This was the hardest part of the migration.

### The requirement

The AI chat panel needs:

- a scrollable message list
- a fixed footer input area
- attachment handling
- voice/text input mode switching
- shared send state
- auto-scroll behavior

### The wrong approaches we tried

#### 1. External sticky input layer

We previously used a keyboard-sticky pattern outside Gorhom's footer system.

Why it was wrong:

- not the intended Gorhom footer model
- too much custom keyboard plumbing
- harder to reason about sheet drag vs keyboard behavior

#### 2. Provider/context bridge for footer

We then tried:

- `AIChatPanelProvider`
- local React context
- `AIChatPanel` reading from context
- `AIChatPanelFooter` reading from context

Why it failed:

- `BottomSheetModal` uses a portal
- modal/footer rendering through the portal made local provider assumptions unsafe
- we hit runtime failures where `AIChatPanel` or footer lost access to the provider

#### 3. Footer registration callback from child to parent

We tried having `AIChatPanel` register a footer renderer back into `UnifiedCommandPanel` state.

Why it failed:

- easy to create state update loops
- easy to accidentally store JSX instead of a component function
- too indirect
- not a clean stable architecture

### Final correct pattern

The final chat pattern is:

1. `UnifiedCommandPanel` owns one shared controller hook.
2. `useAIChatController(...)` lives in `components/AIChatPanel.tsx`.
3. The controller returns all shared chat state and actions.
4. `AIChatPanel` renders the chat body from that controller.
5. `AIChatPanelFooter` renders the Gorhom footer from that same controller.
6. `UnifiedCommandPanel` passes:
   - `controller` to `AIChatPanel`
   - `footerComponent={(props) => <AIChatPanelFooter {...props} controller={controller} />}`

This is the cleanest version because:

- parent owns the modal
- parent owns the controller state
- body and footer are sibling render paths
- no portal-sensitive context
- no callback registration loop

### Final chat structure

#### `useAIChatController(...)`

Owns:

- message query data
- optimistic message state
- speaking state
- auto voice-output behavior
- edit-memory bridge
- attachment state
- send handler
- clear handler
- deep-search handler
- list ref
- render function for each message
- key extractor

#### `AIChatPanel`

Consumes `controller` and renders:

- top bar
- clear button
- `BottomSheetFlatList`
- empty state when no messages

#### `AIChatPanelFooter`

Consumes `controller` and renders:

- `BottomSheetFooter`
- `ChatInputBar`

This is the fixed bottom input area that belongs to the sheet.

## Edit Memory Sheet

### Important migration decision

The reminder date picker originally used a separate React Native `Modal`.

That was removed because it broke sheet-native flow.

### Final pattern

The picker is inline inside the sheet body:

- tap reminder field
- expand inline picker block
- choose date/time directly in the sheet
- collapse with Done

### Why this is better

- no nested modal stack
- no separate overlay life cycle
- gestures stay within the sheet
- feels native to the bottom sheet flow

## Turn Breakdown Sheet

`TurnBreakdownSheet` became a first-class global hosted sheet instead of a nested or local ad hoc panel.

### State changes

`store/ui.ts` was updated so:

- `turnBreakdown` payload is `{ chatTurnId: string }`
- `openTurnBreakdown(chatTurnId)` is explicit and typed

### Why this matters

This keeps breakdown inspection as a proper shared sheet route instead of an embedded secondary modal inside chat.

## File Preview Sheet

This sheet now uses a direct `BottomSheetModal` with:

- detached large-screen support
- `BottomSheetScrollView`
- standard dismiss lifecycle

We also later polished some actions using Gorhom-provided touchables.

## Home Overview Sheet

This sheet is now:

- direct modal
- detached on large screens
- vertical sheet scroll via `BottomSheetScrollView`
- horizontal flashback list via gesture-handler `FlatList`

This removed the mixed and less reliable list setup from earlier iterations.

## Analytics Detail Sheet

The sheet in `app/(protected)/statistics.tsx` is route-local rather than globally hosted, but it follows the same modal pattern:

- local modal ref
- `presentedRef`
- direct `BottomSheetModal`
- detached large-screen configuration
- `BottomSheetScrollView`
- horizontal gesture-handler list for the chart surface

## Touchables Polish

Gorhom exports touchables that use gesture-handler under the hood.

We used these selectively where it made sense in sheet-local chrome:

- `TouchableOpacity` from `@gorhom/bottom-sheet`

Examples included:

- some header controls
- some action buttons inside sheet surfaces

We did not mass-convert every `Pressable` in the app because that would be churn without guaranteed benefit. The intention was to improve the most sheet-relevant interaction surfaces while keeping the code understandable.

## Why `BaseSheet` Was Deleted

We originally replaced the old implementation with a shared `BaseSheet` wrapper over `BottomSheetModal`.

That wrapper gradually became a problem because it:

- centralized detached sizing
- centralized insets
- centralized keyboard defaults
- centralized gesture behavior
- hid actual Gorhom usage behind an abstraction

Once we moved those decisions into each sheet directly, `BaseSheet` stopped adding enough value and became unnecessary.

Deleting it was the correct end state for a clean migration.

## Rebuild Checklist

If all current changes are discarded, rebuild in this order.

### 1. Install and wire the library

- add `@gorhom/bottom-sheet`
- ensure `react-native-reanimated/plugin` is enabled
- ensure gesture-handler and safe-area dependencies are healthy

### 2. Fix root provider order

In `app/_layout.tsx`:

- keep `BottomSheetModalProvider` inside Tamagui/auth/confirm providers
- make sure sheet content retains:
  - theme context
  - auth context
  - confirm context

### 3. Convert sheets one by one to direct `BottomSheetModal`

For each sheet:

- create `modalRef`
- create `presentedRef`
- add `useEffect` to call `present()` / `dismiss()`
- add `onDismiss` to reset `presentedRef` and close app state
- move large-screen detached behavior into the sheet itself

### 4. Replace content primitives

- replace vertical sheet `ScrollView` with `BottomSheetScrollView`
- replace sheet text inputs with `BottomSheetTextInput`
- use `BottomSheetFlatList` for main vertical virtualized lists

### 5. Rebuild chat correctly

Do not use:

- keyboard sticky wrappers
- local provider bridges for footer/body
- child-to-parent footer registration state loops

Do use:

- `useAIChatController(...)`
- `AIChatPanel controller={controller}`
- `AIChatPanelFooter controller={controller}`
- `footerComponent={(props) => <AIChatPanelFooter {...props} controller={controller} />}`

### 6. Fix horizontal content

Inside sheets:

- use gesture-handler `FlatList` for horizontal list-like content

### 7. Polish interactions

Optionally use Gorhom touchables for the most sheet-local controls:

- `TouchableOpacity` from `@gorhom/bottom-sheet`

### 8. Typecheck constantly

Run:

```sh
bun run typecheck
```

after each meaningful migration step.

## Common Failure Modes

### Tamagui theme error

Symptom:

- "Can't find Tamagui configuration"
- missing parent theme context

Cause:

- `BottomSheetModalProvider` or sheet portal outside Tamagui provider chain

Fix:

- move provider order so sheet portal is inside Tamagui

### `useAuth` / `useAppConfirm` missing provider

Cause:

- same portal/provider ordering issue

Fix:

- place `BottomSheetModalProvider` inside auth/confirm providers

### Invalid element type for footer

Symptom:

- React says it received `<BottomSheetFooter />` as an invalid type

Cause:

- storing rendered JSX in state instead of a footer component function

Fix:

- do not use that callback-registration design
- prefer parent-owned controller + direct footer component

### Maximum update depth exceeded

Cause:

- `useEffect` registering footer into parent state every render
- dependency churn from callback recreation

Fix:

- remove registration model
- use stable shared controller pattern

### Chat provider missing inside modal

Cause:

- local React context not safe across modal portal assumptions

Fix:

- remove local provider bridge
- use plain props from parent-owned controller

### Gesture conflicts on horizontal content

Cause:

- plain RN horizontal list/scroll surface inside sheet

Fix:

- use `FlatList` from `react-native-gesture-handler`

## Final File Map

These files are the main reference points for the final architecture:

- `app/_layout.tsx`
  - root provider ordering
- `components/UnifiedCommandPanel.tsx`
  - direct modal
  - parent-owned chat controller
  - Gorhom footer usage
- `components/AIChatPanel.tsx`
  - `useAIChatController`
  - `AIChatPanel`
  - `AIChatPanelFooter`
- `components/EditMemorySheet.tsx`
  - direct modal
  - inline reminder picker
- `components/sheets/HomeOverviewSheet.tsx`
  - direct modal
  - gesture-handler horizontal list
- `components/sheets/FilePreviewSheet.tsx`
  - direct modal
- `components/sheets/TurnBreakdownSheet.tsx`
  - direct modal
- `app/(protected)/statistics.tsx`
  - route-local detail modal
- `components/sheets/ProtectedSheetHost.tsx`
  - global mounted sheet host
- `store/ui.ts`
  - sheet open/close state and payloads

## What Is Still Custom and Why

Not everything should become default Gorhom visuals.

The app still keeps:

- custom `SheetHeader`
- custom cards
- custom badges
- custom action rows
- app-specific colors and spacing

That is fine. Gorhom bottom sheet is the interaction framework, not the app's visual identity.

The key thing is that the interaction architecture is now Gorhom-native even though the content visuals are still application-specific.

## Minimal Example of the Final Pattern

This is the pattern to copy when building a new sheet.

```tsx
const modalRef = useRef<BottomSheetModal>(null);
const presentedRef = useRef(false);
const insets = useSafeAreaInsets();
const isLargeScreen = useIsLargeScreen();

const handleDismiss = useCallback(() => {
  presentedRef.current = false;
  closeSheet();
}, [closeSheet]);

useEffect(() => {
  if (open && !presentedRef.current) {
    modalRef.current?.present();
    presentedRef.current = true;
    return;
  }

  if (!open && presentedRef.current) {
    modalRef.current?.dismiss();
  }
}, [open]);

return (
  <BottomSheetModal
    ref={modalRef}
    name="example"
    index={0}
    snapPoints={["80%"]}
    detached={isLargeScreen}
    style={
      isLargeScreen
        ? {
            marginHorizontal: 16,
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }
        : undefined
    }
    topInset={isLargeScreen ? insets.top + 16 : insets.top}
    bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
    keyboardBehavior="interactive"
    keyboardBlurBehavior="restore"
    enableBlurKeyboardOnGesture
    android_keyboardInputMode="adjustResize"
    stackBehavior="push"
    onDismiss={handleDismiss}
  >
    <SheetHeader title="Example" />
    <BottomSheetScrollView
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      ...
    </BottomSheetScrollView>
  </BottomSheetModal>
);
```

## Summary

The migration was not just a library swap. The difficult parts were:

- portal/provider behavior
- footer/input architecture
- eliminating hidden abstractions
- getting large-screen presentation out of a wrapper and into real sheet declarations
- fixing gesture behavior for nested and horizontal content

The final implementation is clean because it is explicit:

- real Gorhom modal per sheet
- real Gorhom scrollables
- real Gorhom footer for chat
- parent-owned shared controller for body/footer coordination
- no hidden sheet abstraction
- no portal-fragile provider bridge

If this work is ever discarded, rebuild from the patterns and order in this file rather than trying to revive the earlier intermediary approaches.
