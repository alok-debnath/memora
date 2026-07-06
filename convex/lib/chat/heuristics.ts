/**
 * Regex heuristics that gate DB grounding and update-vs-create behavior.
 * These run before any AI call, so they must stay cheap and conservative.
 */

const GENERIC_QUERY_PATTERNS = [
  /\bwhat is\b/i,
  /\bwho is\b/i,
  /\bexplain\b/i,
  /\bdefine\b/i,
  /\bwrite\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bbrainstorm\b/i,
  /\btranslate\b/i,
  /\bsummarize\b/i,
  /\bcode\b/i,
  /\bdebug\b/i,
];

const PERSONAL_QUERY_PATTERNS = [
  /\bmy\b/i,
  /\bi have\b/i,
  /\bdo i have\b/i,
  /\bhow many\b/i,
  /\bwhat are\b/i,
  /\bwhich\b/i,
  /\bwhen did\b/i,
  /\breminder\b/i,
  /\bremind\b/i,
  /\bmemory\b/i,
  /\bmemories\b/i,
  /\bfriend\b/i,
  /\bfriends\b/i,
  /\bpeople\b/i,
  /\bname\b/i,
  /\bnames\b/i,
  /\bappointment\b/i,
  /\bmeeting\b/i,
  /\bbirthday\b/i,
  /\bpassport\b/i,
  /\bdeadline\b/i,
  /\bdiary\b/i,
  /\bjournal/i,
  /\bwrote\b/i,
  /\bmood\b/i,
  /\bfeel(?:ing)?s?\b/i,
  /\bfelt\b/i,
  /\byesterday\b/i,
  /\blast week\b/i,
  /\bmy day\b/i,
  /\bhabit/i,
];

const UPDATE_INTENT_PATTERNS = [
  /\bedit\b/i,
  /\bupdate\b/i,
  /\bchange\b/i,
  /\bmodify\b/i,
  /\bfix\b/i,
  /\breschedul(?:e|ing)\b/i,
  /\brename\b/i,
  /\bmove\b/i,
  /\bconvert\b/i,
  /\bturn\b/i,
  /\bmake\b/i,
];

const UPDATE_TARGET_HINT_PATTERNS = [
  /\bmemory\b/i,
  /\breminder\b/i,
  /\bthis\b/i,
  /\bthat\b/i,
  /\bit\b/i,
  /\bsame\b/i,
  /\bexisting\b/i,
  /\bwith id\b/i,
  /\bprevious\b/i,
  /\babove\b/i,
];

export const CREATE_ONLY_INTENT_PATTERNS = [
  /\bremember\b/i,
  /\bsave\b/i,
  /\bnote\b/i,
  /\badd\b/i,
  /\bcapture\b/i,
  /\bstore\b/i,
  /\bremind me\b/i,
];

const FACTUAL_GROUNDING_PATTERNS = [
  /\?/,
  /\bhow many\b/i,
  /\bhow\b/i,
  /\bwhat\b/i,
  /\bwhich\b/i,
  /\bwho\b/i,
  /\bwhen\b/i,
  /\bdo i have\b/i,
  /\blist\b/i,
  /\bshow\b/i,
  /\bfind\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brestore\b/i,
  /\bundo\b/i,
];

export function isGenericOnlyQuery(message: string) {
  const trimmed = message.trim();
  return (
    GENERIC_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    !PERSONAL_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

export function shouldGroundAgainstDb(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (shouldPreferUpdatingExisting(trimmed)) {
    return true;
  }

  if (isGenericOnlyQuery(trimmed)) {
    return false;
  }

  return PERSONAL_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function shouldPreferUpdatingExisting(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  return (
    UPDATE_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    UPDATE_TARGET_HINT_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

export function isReferentialUpdate(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  return (
    shouldPreferUpdatingExisting(trimmed) &&
    (/\bthis\b/i.test(trimmed) ||
      /\bthat\b/i.test(trimmed) ||
      /\bit\b/i.test(trimmed) ||
      /\bsame\b/i.test(trimmed) ||
      /\bprevious\b/i.test(trimmed) ||
      /\babove\b/i.test(trimmed))
  );
}

export function shouldRunInitialGroundingSearch(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  if (shouldPreferUpdatingExisting(trimmed)) {
    return true;
  }
  if (
    CREATE_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    !FACTUAL_GROUNDING_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return false;
  }
  return FACTUAL_GROUNDING_PATTERNS.some((pattern) => pattern.test(trimmed));
}
