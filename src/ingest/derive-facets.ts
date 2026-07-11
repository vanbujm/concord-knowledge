// Derive the metadata facets used for filtering and browsing from a page's
// title, categories, and raw wikitext. Everything here is deterministic parsing
// (no LLM), leaning on the wiki's naming conventions.
//
// Note on duplicates: pages are keyed by their numeric pageId (unique), so
// case-variant titles like "The War Against/against The Onyx Aristocracy" never
// produce duplicate records; there is nothing to canonicalise here.

export type PageType =
  | "newsletter"
  | "history"
  | "war-report"
  | "fiction"
  | "rules"
  | "lore";

export type PageFacets = {
  realm: string | null;
  sphere: string | null;
  pageType: PageType;
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

// Categories that mark a page as mechanically binding rules.
const RULES_CATEGORIES = new Set(
  [
    "Rules",
    "Skill",
    "Skills",
    "Combat",
    "Spells",
    "Spellcasting",
    "Magic",
    "Mana",
    "Crafting",
    "Craft",
    "Expert Craft",
    "Armour",
    "Weapon",
    "Weapons",
    "Abilities",
    "Poison",
    "Potion",
    "Ceremonies",
    "Enchantment",
    "Reliquary",
  ].map((category) => category.toLowerCase()),
);

// Roughly 500 of ~650 pages carry no categories, so we also recognise the
// mechanical pages by title. Kept narrow to avoid pulling lore in.
const RULES_TITLE_PATTERN =
  /(?:\bSkills\b|\bSpells\b|\bCeremonies\b|\bWeapons\b|\bArmour\b|\bPotions\b|Artisan Crafts|Magic Items|Character Creation|Abilities & Calls|Rules Overview)/i;

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

const derivePageType = (input: FacetInput): PageType => {
  const { title, categories, wikitext } = input;
  const hasRulesCategory = categories.some((category) =>
    RULES_CATEGORIES.has(category.toLowerCase()),
  );

  if (/^Winds of the World/i.test(title) || categories.includes("Winds")) {
    return "newsletter";
  }

  if (/^Historic Research/i.test(title)) {
    return "history";
  }

  if (/\bThe War (?:in|against)\b/i.test(title)) {
    return "war-report";
  }

  if (/Tales of the People/i.test(title) || /^\s*<blockquote>/i.test(wikitext)) {
    return "fiction";
  }

  if (hasRulesCategory || RULES_TITLE_PATTERN.test(title)) {
    return "rules";
  }

  return "lore";
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

export const deriveFacets = (input: FacetInput): PageFacets => ({
  realm: deriveRealm(input.title, input.categories),
  sphere: deriveSphere(input.title, input.categories),
  pageType: derivePageType(input),
  seasons: deriveSeasons(input.title, input.wikitext),
});
