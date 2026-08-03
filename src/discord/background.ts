import { MAX_QUERY_CHARS } from "@/config/display";
import { prisma } from "@/db/client";
import type { BackgroundNote } from "@/discord/compose";
import type { WindsEntry } from "@/discord/parse-winds";
import { WINDS_TITLE_STEM } from "@/discord/select-entries";
import { runHybridSearch } from "@/retrieval/hybrid-search";

// Wiki background for the places, factions and people a Winds entry talks about.
// The world brief in character.ts is only a few hundred words, so without this the
// ravens judge an entry against its own wording and little else, which is exactly
// where the phrase-style keywords ("war affecting all warbands") fall down.

const BACKGROUND_LIMIT = 5;

// Each query over-fetches, because an entry's strongest hits are almost always its
// own sub-page, which is already in the prompt in full and so is discarded.
const BACKGROUND_POOL_SIZE = 20;

// How many detected entities go into the query. More than this and the query stops
// being about the entry's subject and starts averaging the whole page.
const ENTITY_QUERY_LIMIT = 6;

// Titles shorter than this are ordinary words such as "Army" or "Fleet". They
// appear all over the corpus, so finding one says nothing about an entry.
const MIN_ENTITY_TITLE_CHARS = 6;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Which wiki pages does this entry actually talk about?
//
// A Winds sub-page cannot be read off its [[links]]: they are unlinked prose, and
// the Mukarrem entry for Autumn 226 carries exactly three links, two of them
// images. A regex for capitalised words picks up every sentence opener instead of
// the names. So the corpus's own page titles become the vocabulary: a title that
// appears in the text is a page worth retrieving. Longest first, because a longer
// title is the more specific one, so "Trade Principality" outranks "Combat".
export const mentionedTitles = (input: {
  text: string;
  knownTitles: string[];
}): string[] =>
  input.knownTitles
    .filter((title) => {
      const tooCommon =
        title.length < MIN_ENTITY_TITLE_CHARS ||
        title.startsWith(WINDS_TITLE_STEM);

      if (tooCommon) {
        return false;
      }

      return new RegExp(`\\b${escapeRegExp(title)}\\b`, "i").test(input.text);
    })
    .sort((left, right) => right.length - left.length);

const buildEntityQuery = (titles: string[]): string => {
  const parts: string[] = [];

  let queryLength = 0;

  for (const title of titles.slice(0, ENTITY_QUERY_LIMIT)) {
    if (queryLength + title.length + 1 > MAX_QUERY_CHARS) {
      break;
    }

    parts.push(title);
    queryLength += title.length + 1;
  }

  return parts.join(" ");
};

// Two queries, most useful first: the entities the entry names, then the affected
// realms and councils as a fallback when nothing recognisable was found.
//
// Other Winds pages are excluded outright. They are seasonal newsletters, the same
// kind of document being summarised, so offering one as background invites the
// ravens to report a previous season's war as though it were this one's. Results
// are also deduplicated by page, since retrieval returns chunks and five slices of
// one page teach the ravens far less than five different pages.
export const loadBackground = async (input: {
  entry: WindsEntry;
  windsTitle: string;
  subPageText: string;
}): Promise<BackgroundNote[]> => {
  const documents = await prisma.document.findMany({ select: { title: true } });

  const entities = mentionedTitles({
    text: input.subPageText,
    knownTitles: documents.map((document) => document.title),
  });

  const queries = [
    buildEntityQuery(entities),
    input.entry.affected.join(" "),
  ].filter((query) => query.length > 0);

  const notesByTitle = new Map<string, BackgroundNote>();

  for (const query of queries) {
    const results = await runHybridSearch({
      query,
      limit: BACKGROUND_POOL_SIZE,
    });

    for (const result of results) {
      const alreadyInPrompt =
        result.title === input.windsTitle ||
        result.title === input.entry.entryTitle;

      if (
        alreadyInPrompt ||
        result.title.startsWith(WINDS_TITLE_STEM) ||
        notesByTitle.has(result.title)
      ) {
        continue;
      }

      notesByTitle.set(result.title, {
        title: result.title,
        headingPath: result.headingPath,
        excerpt: result.excerpt,
      });
    }

    if (notesByTitle.size >= BACKGROUND_LIMIT) {
      break;
    }
  }

  return [...notesByTitle.values()].slice(0, BACKGROUND_LIMIT);
};
