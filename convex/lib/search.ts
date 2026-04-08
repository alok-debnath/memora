export const SEARCH_NOISE_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall",
  "can","need","dare","ought","used","it","its","this","that","these","those",
  "he","she","they","we","you","i","me","my","his","her","their","our","your",
  "him","them","us","what","which","who","whom","whose","where","when","why","how",
  "all","both","each","every","no","not","only","own","same","so","than","too",
  "very","just","more","most","other","some","such","then","there",
  "forget","remember","remind","delete","remove","find","search","show","get",
  "tell","give","let","know","please","want","make","put","set","add","create",
  "save","store","note","list","look","see","check","about","any","also",
  "data","everything","anything","info","information","stuff","things","related",
]);

export function extractSearchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9']/g, "").trim())
    .filter((term) => term.length > 1 && !SEARCH_NOISE_WORDS.has(term));
}

export function cleanSearchQuery(query: string): string {
  const terms = extractSearchTerms(query);
  return terms.length > 0 ? terms.join(" ") : query.trim();
}

export function normalizeSearchQueryHash(query: string): string {
  return query.trim().toLowerCase().slice(0, 100);
}
