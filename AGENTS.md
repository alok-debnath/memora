<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `bunx convex ai-files install`.
<!-- convex-ai-end -->

# Project Notes

## Overview

- Memora is an Expo React Native app with Expo Router and a Convex backend.
- The repository is a single app at the root, not a monorepo.
- Package management uses `bun`.

## Core Commands

- Install dependencies: `bun install`
- Start Expo: `bun run start`
- Start Expo web: `bun run web`
- Run iOS: `bun run ios`
- Run Android: `bun run android`
- Typecheck: `bun run typecheck`
- Start Convex dev: `bunx convex dev`

## Environment

- The app expects `EXPO_PUBLIC_CONVEX_URL` for the client connection.
- AI-related backend work uses `CONVEX_OPENAI_BASE_URL` and `CONVEX_OPENAI_API_KEY` when configured.

## High-Level Structure

- `app/`: Expo Router routes. Public auth screens live under `app/(public)`, authenticated app screens under `app/(protected)`.
- `components/`: Shared UI and auth components.
- `hooks/`, `constants/`, `store/`, `types/`: client-side support code.
- `convex/`: backend schema, queries, mutations, actions, and auth helpers.
- `assets/`: static assets such as icons and splash images.

## Product Notes

- Authentication is session-token based and stored client-side.
- Memory data, diary flows, review cards, sharing, notifications, and chat all live in Convex.
- The design system uses amber/gold accents with Inter and Space Grotesk.
