import {
  fetchPagesByPrefix,
  fetchPagesByTitles,
  type WikiPage,
} from "@/ingest/fetch-wiki";

// Thin wiki-fetch wrapper for the Winds poller. The prefix fetch returns the
// "Winds of the World" index page plus every seasonal page; the caller picks the
// latest with selectLatestWinds.

export const WINDS_TITLE_PREFIX = "Winds of the World";

export const fetchWindsPages = (): Promise<WikiPage[]> =>
  fetchPagesByPrefix(WINDS_TITLE_PREFIX);

// Fetch every entry's sub-page in one query, keyed by title. A title absent from
// the map is an entry the index lists but nobody has written yet.
//
// This used to be one prefix search per title, which meant eighteen requests a
// run to check a single season and drew HTTP 429 rate limiting from the wiki.
export const fetchSubPages = (
  titles: string[],
): Promise<Map<string, WikiPage>> => fetchPagesByTitles(titles);
