import { prisma } from "@/db/client";
import { categoryFeedsRealmOrSphere } from "@/ingest/derive-facets";

// The filterable facet values with document counts, for the web UI's filter
// panel and the MCP list_facets tool.

// The category facet value that selects pages carrying no wiki category at all.
// It is not a real wiki category (none is named this), so it can double as both
// the display label and the filter value the retrieval core recognises.
export const UNCATEGORIZED_VALUE = "Uncategorised";

export type FacetCount = { value: string; count: number };

export type Facets = {
  realms: FacetCount[];
  spheres: FacetCount[];
  categories: FacetCount[];
  seasons: FacetCount[];
};

const SEASON_ORDER = ["Spring", "Summer", "Autumn", "Winter"];

// Most documents first; ties broken alphabetically so equal-count values sit in
// a stable, scannable order rather than whatever order the database returned.
const byCountThenAlpha = (first: FacetCount, second: FacetCount): number => {
  if (second.count !== first.count) {
    return second.count - first.count;
  }

  return first.value.localeCompare(second.value);
};

// Newest season first: the most recent in-world events are the most relevant,
// so they sit at the top of the season filter.
const byRecency = (first: FacetCount, second: FacetCount): number => {
  const [firstSeason, firstYear] = first.value.split(" ");
  const [secondSeason, secondYear] = second.value.split(" ");

  if (firstYear !== secondYear) {
    return Number(secondYear) - Number(firstYear);
  }

  return SEASON_ORDER.indexOf(secondSeason) - SEASON_ORDER.indexOf(firstSeason);
};

export const listFacets = async (): Promise<Facets> => {
  const [realmGroups, sphereGroups, categoryRows, uncategorizedCount, seasonRows] =
    await Promise.all([
      prisma.document.groupBy({
        by: ["realm"],
        _count: { _all: true },
        where: { realm: { not: null } },
      }),
      prisma.document.groupBy({
        by: ["sphere"],
        _count: { _all: true },
        where: { sphere: { not: null } },
      }),
      // unnest expands each document's category array into one row per category,
      // so a page tagged with several categories counts towards each. Pages with
      // no categories contribute nothing here; they are counted separately below.
      prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
        SELECT unnest(categories) AS value, count(*) AS count
        FROM "Document"
        GROUP BY value
      `,
      prisma.document.count({ where: { categories: { isEmpty: true } } }),
      prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
        SELECT unnest(seasons) AS value, count(*) AS count
        FROM "Document"
        GROUP BY value
      `,
    ]);

  const realms: FacetCount[] = [];
  for (const group of realmGroups) {
    if (group.realm !== null) {
      realms.push({ value: group.realm, count: group._count._all });
    }
  }

  const spheres: FacetCount[] = [];
  for (const group of sphereGroups) {
    if (group.sphere !== null) {
      spheres.push({ value: group.sphere, count: group._count._all });
    }
  }

  // Drop categories the realm and sphere filters already cover, so the category
  // filter is not cluttered with e.g. "Panoply" (a sphere) or "Andash" (a realm).
  const categories: FacetCount[] = categoryRows
    .map((row) => ({ value: row.value, count: Number(row.count) }))
    .filter((category) => !categoryFeedsRealmOrSphere(category.value))
    .sort(byCountThenAlpha);

  // Uncategorised is a special bucket (pages with no category), not a real wiki
  // category, so pin it to the top of the list rather than sorting it by count.
  if (uncategorizedCount > 0) {
    categories.unshift({ value: UNCATEGORIZED_VALUE, count: uncategorizedCount });
  }

  const seasons: FacetCount[] = seasonRows.map((row) => ({
    value: row.value,
    count: Number(row.count),
  }));

  return {
    realms: realms.sort(byCountThenAlpha),
    spheres: spheres.sort(byCountThenAlpha),
    categories,
    seasons: seasons.sort(byRecency),
  };
};
