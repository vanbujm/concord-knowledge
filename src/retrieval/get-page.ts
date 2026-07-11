import { MAX_EXCERPT_CHARS } from "@/config/display";
import { prisma } from "@/db/client";
import { buildExcerpt } from "@/retrieval/excerpt";

// Fetch one page by title as a set of bounded, section-by-section excerpts plus
// its source URL. Deliberately not the full wikitext: each section is capped and
// only the first sections are returned, so this stays "excerpts + link", not a
// republished page.

const MAX_SECTIONS = 12;

export type WikiPageView = {
  title: string;
  sourceUrl: string;
  pageType: string;
  realm: string | null;
  sphere: string | null;
  seasons: string[];
  sections: Array<{ headingPath: string; excerpt: string }>;
  truncated: boolean;
};

export const getPageByTitle = async (
  title: string,
): Promise<WikiPageView | null> => {
  const document = await prisma.document.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: {
      title: true,
      sourceUrl: true,
      pageType: true,
      realm: true,
      sphere: true,
      seasons: true,
      chunks: {
        select: { headingPath: true, text: true },
        orderBy: { ordinal: "asc" },
      },
    },
  });

  if (!document) {
    return null;
  }

  const sections = document.chunks.slice(0, MAX_SECTIONS).map((chunk) => ({
    headingPath: chunk.headingPath,
    excerpt: buildExcerpt({
      text: chunk.text,
      terms: [],
      maxChars: MAX_EXCERPT_CHARS,
    }).text,
  }));

  return {
    title: document.title,
    sourceUrl: document.sourceUrl,
    pageType: document.pageType,
    realm: document.realm,
    sphere: document.sphere,
    seasons: document.seasons,
    sections,
    truncated: document.chunks.length > MAX_SECTIONS,
  };
};
