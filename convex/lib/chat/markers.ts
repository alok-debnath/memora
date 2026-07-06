/**
 * The one hidden HTML-comment marker still in use: MEMORA_USED_IDS, the
 * AI-facing fallback protocol for reporting which stored items an answer
 * drew on when surface_cards wasn't called. It is extracted and stripped
 * server-side before persisting — message content in the DB is always
 * clean text; structured data lives in chatMessages.meta.
 */

const USED_IDS_RE = /<!--MEMORA_USED_IDS:\[(.*?)\]-->/;
const MARKER_STRIP_RE = /<!--MEMORA_[A-Z_]+:[\s\S]*?-->/g;

export function hasUsedIdsMarker(content: string): boolean {
  return content.includes("<!--MEMORA_USED_IDS:");
}

/** Extract IDs from a MEMORA_USED_IDS marker and return content without it. */
export function extractUsedIds(content: string): { ids: string[]; cleanText: string } {
  const match = content.match(USED_IDS_RE);
  if (!match?.[1]) {
    return { ids: [], cleanText: content };
  }
  const ids = match[1]
    .replace(/["'\[\]\s]/g, "")
    .split(",")
    .filter(Boolean);
  return {
    ids,
    cleanText: content.replace(USED_IDS_RE, "").trim(),
  };
}

/** Final-persist safety net: drop any marker-shaped comment the model emitted. */
export function stripMarkersFromContent(content: string): string {
  return content.replace(MARKER_STRIP_RE, "").trim();
}
