<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `bun x convex ai-files install`.

<!-- convex-ai-end -->

# Memora Agent Guide

## Project Snapshot

- Single Expo React Native app at the repo root.
- Navigation uses Expo Router.
- Backend uses Convex with Better Auth integration.
- Package manager is `bun`.
- TypeScript is strict and uses the `@/*` path alias.

## Core Commands

- Install dependencies: `bun install`
- Start Expo: `bun run start`
- Start Expo web: `bun run web`
- Run iOS: `bun run ios`
- Run Android: `bun run android`
- Typecheck: `bun run typecheck`
- Start Convex dev: `bun x convex dev`

## Environment

- `EXPO_PUBLIC_CONVEX_URL`: Convex client URL used by the Expo app.
- `EXPO_PUBLIC_CONVEX_SITE_URL`: Better Auth base URL when configured.
- `SITE_URL`: trusted site origin for auth flows.
- `CONVEX_OPENAI_BASE_URL`, `CONVEX_OPENAI_API_KEY`: AI backend configuration when used.
- `RESEND_API_KEY`, `BETTER_AUTH_FROM_EMAIL`: optional password reset email delivery.

## Repo Map

- `app/`: Expo Router routes and route groups.
- `components/`: shared UI, auth, and sheet components.
- `convex/`: schema, queries, mutations, actions, auth, and backend helpers.
- `store/`, `hooks/`, `constants/`, `types/`, `lib/`: client support code.
- `assets/`: images and static assets.
- `docs/`: project-specific implementation notes.
- `android/`, `ios/`: native Expo prebuild output.

## Project Conventions

- Public routes live under `app/(public)` and authenticated flows live under `app/(protected)`.
- Prefer existing shared UI primitives before adding screen-local components or raw styling.
- Follow `docs/ui-styling.md` for UI work; Tamagui is the primary styling system.
- Prefer Bun commands in this repo; do not treat it as a monorepo.
- For Convex work, treat generated types and `convex/_generated/ai/guidelines.md` as the source of truth.
