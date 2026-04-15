/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_aiProviderKeys from "../actions/aiProviderKeys.js";
import type * as actions_backfillEmbeddings from "../actions/backfillEmbeddings.js";
import type * as actions_detectConflicts from "../actions/detectConflicts.js";
import type * as actions_manageTopics from "../actions/manageTopics.js";
import type * as actions_memoryChat from "../actions/memoryChat.js";
import type * as actions_processAttachment from "../actions/processAttachment.js";
import type * as actions_processDiary from "../actions/processDiary.js";
import type * as actions_processMemory from "../actions/processMemory.js";
import type * as actions_semanticSearch from "../actions/semanticSearch.js";
import type * as actions_transcribeAudio from "../actions/transcribeAudio.js";
import type * as aiPricing from "../aiPricing.js";
import type * as aiProviders from "../aiProviders.js";
import type * as analytics from "../analytics.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as authSchema from "../authSchema.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as diary from "../diary.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_aiDispatch from "../lib/aiDispatch.js";
import type * as lib_aiNormalization from "../lib/aiNormalization.js";
import type * as lib_aiPricing from "../lib/aiPricing.js";
import type * as lib_aiSecrets from "../lib/aiSecrets.js";
import type * as lib_attachmentExtraction from "../lib/attachmentExtraction.js";
import type * as lib_memoryKind from "../lib/memoryKind.js";
import type * as lib_memorySnapshot from "../lib/memorySnapshot.js";
import type * as lib_memoryStats from "../lib/memoryStats.js";
import type * as lib_providers_google from "../lib/providers/google.js";
import type * as lib_providers_openai from "../lib/providers/openai.js";
import type * as lib_providers_types from "../lib/providers/types.js";
import type * as lib_reminderSync from "../lib/reminderSync.js";
import type * as lib_reminderTitle from "../lib/reminderTitle.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_semanticSearch from "../lib/semanticSearch.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_withAuth from "../lib/withAuth.js";
import type * as memories from "../memories.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as nudges from "../nudges.js";
import type * as processDiaryMutations from "../processDiaryMutations.js";
import type * as processMemoryMutations from "../processMemoryMutations.js";
import type * as review from "../review.js";
import type * as sharing from "../sharing.js";
import type * as userTopics from "../userTopics.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/aiProviderKeys": typeof actions_aiProviderKeys;
  "actions/backfillEmbeddings": typeof actions_backfillEmbeddings;
  "actions/detectConflicts": typeof actions_detectConflicts;
  "actions/manageTopics": typeof actions_manageTopics;
  "actions/memoryChat": typeof actions_memoryChat;
  "actions/processAttachment": typeof actions_processAttachment;
  "actions/processDiary": typeof actions_processDiary;
  "actions/processMemory": typeof actions_processMemory;
  "actions/semanticSearch": typeof actions_semanticSearch;
  "actions/transcribeAudio": typeof actions_transcribeAudio;
  aiPricing: typeof aiPricing;
  aiProviders: typeof aiProviders;
  analytics: typeof analytics;
  attachments: typeof attachments;
  auth: typeof auth;
  authSchema: typeof authSchema;
  chat: typeof chat;
  crons: typeof crons;
  dataExport: typeof dataExport;
  diary: typeof diary;
  history: typeof history;
  http: typeof http;
  integrations: typeof integrations;
  "lib/ai": typeof lib_ai;
  "lib/aiDispatch": typeof lib_aiDispatch;
  "lib/aiNormalization": typeof lib_aiNormalization;
  "lib/aiPricing": typeof lib_aiPricing;
  "lib/aiSecrets": typeof lib_aiSecrets;
  "lib/attachmentExtraction": typeof lib_attachmentExtraction;
  "lib/memoryKind": typeof lib_memoryKind;
  "lib/memorySnapshot": typeof lib_memorySnapshot;
  "lib/memoryStats": typeof lib_memoryStats;
  "lib/providers/google": typeof lib_providers_google;
  "lib/providers/openai": typeof lib_providers_openai;
  "lib/providers/types": typeof lib_providers_types;
  "lib/reminderSync": typeof lib_reminderSync;
  "lib/reminderTitle": typeof lib_reminderTitle;
  "lib/search": typeof lib_search;
  "lib/semanticSearch": typeof lib_semanticSearch;
  "lib/validators": typeof lib_validators;
  "lib/withAuth": typeof lib_withAuth;
  memories: typeof memories;
  migrations: typeof migrations;
  notifications: typeof notifications;
  nudges: typeof nudges;
  processDiaryMutations: typeof processDiaryMutations;
  processMemoryMutations: typeof processMemoryMutations;
  review: typeof review;
  sharing: typeof sharing;
  userTopics: typeof userTopics;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
