import type { WikiPage } from "@/ingest/fetch-wiki";
import type { WindsEntry } from "@/discord/parse-winds";

// Pure selection logic for the Winds poller: which season page to watch, which
// entries are new, and whether a page is being seen for the first time.

const SEASON_ORDER = ["Spring", "Summer", "Autumn", "Winter"];

// "Winds of the World - Autumn 226" -> a sortable key. Non-seasonal titles
// (e.g. the "Winds of the World" index page) return null and are skipped.
const seasonSortKey = (title: string): number | null => {
  const match = title.match(/-\s*(Spring|Summer|Autumn|Winter)\s+(\d+)\s*$/);

  if (!match) {
    return null;
  }

  const year = Number(match[2]);
  const seasonIndex = SEASON_ORDER.indexOf(match[1]);

  return year * 10 + seasonIndex;
};

// Pick the newest seasonal Winds page from a prefix fetch (which also returns the
// index page and any older seasons). Returns null when none is seasonal.
export const selectLatestWinds = (pages: WikiPage[]): WikiPage | null => {
  let latest: WikiPage | null = null;
  let latestKey = -1;

  for (const page of pages) {
    const key = seasonSortKey(page.title);

    if (key !== null && key > latestKey) {
      latest = page;
      latestKey = key;
    }
  }

  return latest;
};

export const selectNewEntries = (input: {
  entries: WindsEntry[];
  seenTitles: Set<string>;
}): WindsEntry[] =>
  input.entries.filter((entry) => !input.seenTitles.has(entry.entryTitle));

// Baselining is a first-install guard, not a per-season one. On the very first run
// (no rows recorded for any season) the season already under way is marked
// seen-only so the poller does not dump a whole backlog into the channel. Every
// later season is left unbaselined, because its entries appear while the poller is
// already watching and each one should be announced as it is published.
//
// Deliberately not keyed on the current page: a new season's index page lists all
// of its entry titles weeks before any of them are written, so treating "no rows
// for this page" as a backlog would mark the whole season seen and silence it.
export const shouldBaseline = (totalRowCount: number): boolean =>
  totalRowCount === 0;
