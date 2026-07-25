import { prisma } from "@/db/client";

// Store access for registered keywords. `scope` is the literal "general" for a
// band-wide keyword, or a Discord user id for a personal one.

export const GENERAL_SCOPE = "general";

export type InterestRow = { scope: string; keyword: string };

const normalize = (keyword: string): string => keyword.toLowerCase().trim();

// Returns true when a new row was added, false when the keyword was blank or
// already registered for this scope.
export const addInterest = async (input: {
  guildId: string;
  scope: string;
  keyword: string;
}): Promise<boolean> => {
  const keyword = normalize(input.keyword);

  if (!keyword) {
    return false;
  }

  try {
    await prisma.interest.create({
      data: { guildId: input.guildId, scope: input.scope, keyword },
    });

    return true;
  } catch {
    // Unique-constraint violation: the keyword is already registered here.
    return false;
  }
};

export const removeInterest = async (input: {
  guildId: string;
  scope: string;
  keyword: string;
}): Promise<boolean> => {
  const { count } = await prisma.interest.deleteMany({
    where: {
      guildId: input.guildId,
      scope: input.scope,
      keyword: normalize(input.keyword),
    },
  });

  return count > 0;
};

export const listInterests = async (input: {
  guildId: string;
  scope: string;
}): Promise<string[]> => {
  const rows = await prisma.interest.findMany({
    where: { guildId: input.guildId, scope: input.scope },
    select: { keyword: true },
    orderBy: { keyword: "asc" },
  });

  return rows.map((row) => row.keyword);
};

export const loadGuildInterests = async (
  guildId: string,
): Promise<InterestRow[]> =>
  prisma.interest.findMany({
    where: { guildId },
    select: { scope: true, keyword: true },
  });
