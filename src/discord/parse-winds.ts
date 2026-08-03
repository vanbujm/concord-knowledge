// Parse a raw "Winds of the World" wikitext page into its entries.
//
// Each entry is a heading that is a single wiki link, followed by a bold
// "affected" tag line and some intro prose, e.g.:
//
//   === [[Sub-page Title|Display]] ===
//   * '''The War Chamber / Lerona Mere'''
//   Intro prose for the entry...
//
// The heading level and styling are not consistent between seasons: Autumn 226
// used level 3 with a bare link, Spring 226 used level 2 and wrapped many of its
// links in bold ('''). Both levels and the optional bold are therefore accepted,
// and the opening and closing "=" runs must be the same length.
//
// Parsing runs on the RAW wikitext, before cleanWikitext, because cleaning strips
// the [[link target]] and the ''' bold markers this relies on. Headings that are
// not a single link (e.g. "=== Further Reading ===") are not entries at any level.

export type WindsEntry = {
  // The [[link target]]: the canonical title of the linked sub-page.
  entryTitle: string;
  // The display text when the link is piped ([[Target|Display]]), else null.
  displayText: string | null;
  // The bold "affected councils / realms / services" line, verbatim, or null.
  tagLine: string | null;
  // The affected parties, split out of the tag line on "/" and ",".
  affected: string[];
  // The entry's body: everything from its heading to the next heading.
  body: string;
};

const ANY_HEADING = /^(={2,3})\s*(.+?)\s*\1\s*$/gm;
const LINK_ONLY_HEADING =
  /^(?:'''\s*)?\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\](?:\s*''')?$/;
const BOLD_TAG_LINE = /^\*\s*'''(.+?)'''/m;

const splitAffected = (tagLine: string): string[] =>
  tagLine
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const parseWindsEntries = (wikitext: string): WindsEntry[] => {
  // Collect every level-3 heading with its position, so each entry's body can be
  // bounded by the next heading (whether or not that next heading is an entry).
  const headings: Array<{ text: string; contentStart: number }> = [];

  for (const match of wikitext.matchAll(ANY_HEADING)) {
    headings.push({
      text: match[2],
      contentStart: (match.index ?? 0) + match[0].length,
    });
  }

  const entries: WindsEntry[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const linkMatch = heading.text.match(LINK_ONLY_HEADING);

    if (!linkMatch) {
      continue;
    }

    const nextHeading = headings[index + 1];
    const body = wikitext
      .slice(heading.contentStart, nextHeading?.contentStart ?? wikitext.length)
      .trim();

    const tagLineMatch = body.match(BOLD_TAG_LINE);
    const tagLine = tagLineMatch ? tagLineMatch[1].trim() : null;

    entries.push({
      entryTitle: linkMatch[1].trim(),
      displayText: linkMatch[2]?.trim() ?? null,
      tagLine,
      affected: tagLine ? splitAffected(tagLine) : [],
      body,
    });
  }

  return entries;
};
