// Derive the metadata facets used for filtering and browsing from a page's
// title, categories, and raw wikitext. Everything here is deterministic parsing
// (no LLM), leaning on the wiki's naming conventions.
//
// The category facet is NOT derived here: it is the wiki's own category list,
// stored verbatim. Only realm, sphere, and seasons are inferred, because those
// are useful groupings the wiki does not tag consistently.
//
// Note on duplicates: pages are keyed by their numeric pageId (unique), so
// case-variant titles like "The War Against/against The Onyx Aristocracy" never
// produce duplicate records; there is nothing to canonicalise here.

export type PageFacets = {
  realm: string | null;
  sphere: string | null;
  seasons: string[];
};

type FacetInput = {
  title: string;
  categories: string[];
  wikitext: string;
};

// Canonical realm name -> a pattern that matches its name in a title or
// category. `Lerona ?Mere` folds the "LeronaMere" category into "Lerona Mere".
const REALMS: Array<{ name: string; pattern: RegExp }> = [
  { name: "The Iron Valley", pattern: /Iron Valley/i },
  { name: "Lerona Mere", pattern: /Lerona ?Mere/i },
  { name: "Andash", pattern: /\bAndash\b/i },
  { name: "Greenweald Baronies", pattern: /Greenweald/i },
  { name: "Kingdom of Bordevar", pattern: /Bordevar/i },
];

const SPHERES = [
  "Anarch",
  "Lumos",
  "Arcadian",
  "Cervitas",
  "Panoply",
  "Stallia",
];

const SEASON_PATTERN = /\b(Spring|Summer|Autumn|Winter)\s+(2\d\d)\b/g;
const SEASON_ORDER = ["Spring", "Summer", "Autumn", "Winter"];

const deriveRealm = (title: string, categories: string[]): string | null => {
  const haystack = `${title} ${categories.join(" ")}`;

  for (const realm of REALMS) {
    if (realm.pattern.test(haystack)) {
      return realm.name;
    }
  }

  return null;
};

const deriveSphere = (title: string, categories: string[]): string | null => {
  const haystack = `${title} ${categories.join(" ")}`;

  for (const sphere of SPHERES) {
    if (new RegExp(`\\b${sphere}\\b`, "i").test(haystack)) {
      return sphere;
    }
  }

  return null;
};

const deriveSeasons = (title: string, wikitext: string): string[] => {
  const haystack = `${title}\n${wikitext}`;
  const seen = new Set<string>();

  for (const match of haystack.matchAll(SEASON_PATTERN)) {
    seen.add(`${match[1]} ${match[2]}`);
  }

  return [...seen].sort((first, second) => {
    const [firstSeason, firstYear] = first.split(" ");
    const [secondSeason, secondYear] = second.split(" ");

    if (firstYear !== secondYear) {
      return Number(firstYear) - Number(secondYear);
    }

    return SEASON_ORDER.indexOf(firstSeason) - SEASON_ORDER.indexOf(secondSeason);
  });
};

// True when a wiki category on its own already feeds the realm or sphere facet:
// the sphere categories ("Panoply", "Stallia", ...) and the realm categories
// ("Andash", "Greenweald", the smushed "LeronaMere", ...). The category filter
// drops these so it does not simply repeat what the realm and sphere filters
// already offer. Sharing the derivation keeps this in step with how those two
// facets are inferred.
export const categoryFeedsRealmOrSphere = (category: string): boolean =>
  deriveRealm("", [category]) !== null || deriveSphere("", [category]) !== null;

export const deriveFacets = (input: FacetInput): PageFacets => ({
  realm: deriveRealm(input.title, input.categories),
  sphere: deriveSphere(input.title, input.categories),
  seasons: deriveSeasons(input.title, input.wikitext),
});
