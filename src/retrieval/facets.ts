import { prisma } from "@/db/client";

// The filterable facet values with document counts, for the web UI's filter
// panel and the MCP list_facets tool.

export type FacetCount = { value: string; count: number };

export type Facets = {
  realms: FacetCount[];
  spheres: FacetCount[];
  pageTypes: FacetCount[];
  seasons: FacetCount[];
};

const SEASON_ORDER = ["Spring", "Summer", "Autumn", "Winter"];

const byCountDescending = (first: FacetCount, second: FacetCount): number =>
  second.count - first.count;

const chronologically = (first: FacetCount, second: FacetCount): number => {
  const [firstSeason, firstYear] = first.value.split(" ");
  const [secondSeason, secondYear] = second.value.split(" ");

  if (firstYear !== secondYear) {
    return Number(firstYear) - Number(secondYear);
  }

  return SEASON_ORDER.indexOf(firstSeason) - SEASON_ORDER.indexOf(secondSeason);
};

export const listFacets = async (): Promise<Facets> => {
  const [realmGroups, sphereGroups, pageTypeGroups, seasonRows] =
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
      prisma.document.groupBy({ by: ["pageType"], _count: { _all: true } }),
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

  const pageTypes: FacetCount[] = pageTypeGroups.map((group) => ({
    value: group.pageType,
    count: group._count._all,
  }));

  const seasons: FacetCount[] = seasonRows.map((row) => ({
    value: row.value,
    count: Number(row.count),
  }));

  return {
    realms: realms.sort(byCountDescending),
    spheres: spheres.sort(byCountDescending),
    pageTypes: pageTypes.sort(byCountDescending),
    seasons: seasons.sort(chronologically),
  };
};
