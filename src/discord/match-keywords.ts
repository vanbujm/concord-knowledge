// Deterministic keyword matching, used as a floor beneath the LLM's relatedness
// judgement so an exact keyword is never missed. Matching is case-insensitive and
// bounded by word edges, so "war" does not match "warden"; multi-word phrases
// match as a whole ("lerona mere" matches only that pair, in order).

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const matchKeywords = (input: {
  text: string;
  keywords: string[];
}): string[] => {
  const haystack = input.text.toLowerCase();

  return input.keywords.filter((keyword) => {
    const needle = keyword.toLowerCase().trim();

    if (!needle) {
      return false;
    }

    return new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(haystack);
  });
};
