import { fetchPagesByPrefix, type WikiPage } from "@/ingest/fetch-wiki";

// Thin wiki-fetch wrapper for the Winds poller. The prefix fetch returns the
// "Winds of the World" index page plus every seasonal page; the caller picks the
// latest with selectLatestWinds.

export const WINDS_TITLE_PREFIX = "Winds of the World";

export const fetchWindsPages = (): Promise<WikiPage[]> =>
  fetchPagesByPrefix(WINDS_TITLE_PREFIX);

// Best-effort fetch of one linked sub-page by exact title, for fuller LLM
// context. A prefix search can return longer-titled neighbours, so we keep only
// the exact-title match; null when the sub-page cannot be found.
export const fetchSubPage = async (title: string): Promise<WikiPage | null> => {
  const pages = await fetchPagesByPrefix(title);

  return pages.find((page) => page.title === title) ?? null;
};
