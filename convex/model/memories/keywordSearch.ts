import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { isActiveMemory } from "./helpers";

/**
 * Proportional keyword scan over the user's recent active memories.
 * Shared by the instant-search query and the AI keyword channel.
 */
export async function executeKeywordSearch(
  ctx: QueryCtx,
  userId: Id<"users">,
  queryTerms: string[],
  exactPhrase?: string,
): Promise<{ memory: Doc<"memories">; proportion: number; matched: number; score: number }[]> {
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .order("desc")
    .take(200);

  const userTopics = await ctx.db
    .query("userTopics")
    .withIndex("by_user_and_isArchived", (q) => q.eq("userId", userId).eq("isArchived", false))
    .take(100);
  const topicMap = new Map<Id<"userTopics">, string>();
  for (const t of userTopics) {
    if (!t.isArchived) topicMap.set(t._id, t.name.toLowerCase());
  }

  return memories
    .filter(isActiveMemory)
    .map((m) => {
      const topicNames = (m.topicIds ?? []).map((id) => topicMap.get(id)).filter(Boolean);
      const primaryTopic = m.primaryTopicId ? topicMap.get(m.primaryTopicId) : "";
      if (primaryTopic) topicNames.push(primaryTopic);

      const haystack = [
        m.title ?? "",
        m.content ?? "",
        ...(m.people ?? []),
        ...(m.locations ?? []),
        m.lifeArea,
        m.entryKind,
        m.semanticSummary,
        ...(m.searchAliases ?? []),
        ...(m.searchConcepts ?? []),
        ...topicNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let matched = 0;
      for (const term of queryTerms) {
        let singular = term;
        if (term.endsWith("ies") && term.length > 4) {
          singular = term.substring(0, term.length - 3) + "y";
        } else if (term.endsWith("s") && term.length > 3) {
          singular = term.substring(0, term.length - 1);
        }

        if (haystack.includes(term) || (singular !== term && haystack.includes(singular))) {
          matched++;
        }
      }
      const proportion = matched / queryTerms.length;
      const phrase = exactPhrase?.trim().toLowerCase();
      const score =
        phrase && phrase.length >= 3 && haystack.includes(phrase)
          ? Math.min(1, proportion + 0.3)
          : proportion;
      return { memory: m, proportion, matched, score };
    })
    .filter(({ matched, proportion }) => {
      if (queryTerms.length === 1) return matched >= 1;
      return proportion >= 0.4;
    })
    .sort((a, b) => b.score - a.score || b.matched - a.matched);
}
