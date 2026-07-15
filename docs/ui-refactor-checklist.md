# Living Timeline UI Refactor

This checklist tracks the one-pass migration to Memora's shared Living Timeline design system.

## Foundations

- [x] Add semantic control, type, and motion tokens.
- [x] Add shared animated selection tabs and icon buttons.
- [x] Add shared filter chips, list rows, settings rows, and adaptive navigation menu.
- [x] Add automated UI consistency checks.

## Navigation

- [x] Use one navigation model across mobile, rail, sidebar, and app menu.
- [x] Change primary destinations to Today, Timeline, Journal, and Review.
- [x] Keep Capture as the center action and preserve existing route URLs.
- [x] Add restrained active transitions on mobile and desktop.

## Screens

- [x] Primary: Today, Timeline, Journal, Review.
- [x] Library: Reminders, Files, Knowledge graph.
- [x] Insights: Analytics.
- [x] Account: Settings, Profile, Data.
- [x] System surfaces: auth, onboarding, sheets, chat, admin.

## Cleanup and verification

- [x] Remove local tab, chip, icon-button, card, menu, and status duplicates.
- [x] Verify reduced motion, keyboard focus, accessibility state, and 44px targets.
- [x] Run formatting, UI consistency, typecheck, tests, and Expo export.
