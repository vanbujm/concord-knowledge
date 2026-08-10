import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPersonalInterest,
  GENERAL_SCOPE,
} from "@/discord/interests-store";

vi.mock("@/db/client", () => ({
  prisma: {
    interest: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/db/client");

const foundScopes = (scopes: string[]) => {
  const rows = scopes.map((scope) => ({ scope }));

  // Cast: the call under test passes a select so it yields scopes alone, while the
  // generated Prisma type describes a whole Interest row.
  vi.mocked(prisma.interest.findMany).mockResolvedValue(rows as never);
};

describe("clearPersonalInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    foundScopes([]);
    vi.mocked(prisma.interest.deleteMany).mockResolvedValue({ count: 0 });
  });

  it("removes the keyword from every personal scope that held it", async () => {
    foundScopes(["user-1", "user-2"]);

    const cleared = await clearPersonalInterest({
      guildId: "guild-1",
      keyword: "Mandrianos",
    });

    expect(cleared).toEqual(["user-1", "user-2"]);
    expect(prisma.interest.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("never touches the band-wide row", async () => {
    foundScopes(["user-1"]);

    await clearPersonalInterest({ guildId: "guild-1", keyword: "mandrianos" });

    const deleteArgs = vi.mocked(prisma.interest.deleteMany).mock.calls[0][0];
    expect(deleteArgs?.where).toMatchObject({
      scope: { not: GENERAL_SCOPE },
    });
  });

  it("normalises the keyword before matching", async () => {
    foundScopes(["user-1"]);

    await clearPersonalInterest({ guildId: "guild-1", keyword: "  MANDRIANOS " });

    const findArgs = vi.mocked(prisma.interest.findMany).mock.calls[0][0];
    expect(findArgs?.where).toMatchObject({ keyword: "mandrianos" });
  });

  it("deletes nothing when no personal copy exists", async () => {
    const cleared = await clearPersonalInterest({
      guildId: "guild-1",
      keyword: "vidania",
    });

    expect(cleared).toEqual([]);
    expect(prisma.interest.deleteMany).not.toHaveBeenCalled();
  });

  it("ignores a blank keyword without querying", async () => {
    const cleared = await clearPersonalInterest({
      guildId: "guild-1",
      keyword: "   ",
    });

    expect(cleared).toEqual([]);
    expect(prisma.interest.findMany).not.toHaveBeenCalled();
  });
});
