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

// A Winds page is baselined the first time it is seen (no rows recorded yet): its
// current entries are marked seen-only and nothing is posted, so the poller never
// dumps a whole existing season into the channel on its first run.
export const shouldBaseline = (existingRowCount: number): boolean =>
  existingRowCount === 0;
