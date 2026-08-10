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

// A band-wide keyword supersedes anyone's personal copy of it. The band keyword
// already posts the entry to the channel, so a personal duplicate adds nothing but
// a redundant mention: the member is pinged for something the whole band watches.
// Adding band-wide therefore clears the personal copies rather than refusing.
//
// Runs whether or not the band keyword was newly added, so the command also
// repairs an overlap that already exists.
//
// Returns the scopes the keyword was removed from, so the reply can say how many
// personal lists were touched.
export const clearPersonalInterest = async (input: {
  guildId: string;
  keyword: string;
}): Promise<string[]> => {
  const keyword = normalize(input.keyword);

  if (!keyword) {
    return [];
  }

  const personalCopies = {
    guildId: input.guildId,
    keyword,
    scope: { not: GENERAL_SCOPE },
  };

  const rows = await prisma.interest.findMany({
    where: personalCopies,
    select: { scope: true },
  });

  if (rows.length === 0) {
    return [];
  }

  await prisma.interest.deleteMany({ where: personalCopies });

  return rows.map((row) => row.scope);
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
