import { prisma } from "@/db/client";
import type { WindsEntry } from "@/discord/parse-winds";

// Announcement bookkeeping: which entries of a Winds page have already been
// processed, and recording each one as either seen-only (baseline / not
// relevant) or posted.

// Total rows across every season. Zero means the poller has never completed a
// run, which is what distinguishes a first-ever install from a new season.
export const countAnnouncements = async (): Promise<number> =>
  prisma.windsAnnouncement.count();

export const loadSeenEntryTitles = async (
  windsPageId: number,
): Promise<Set<string>> => {
  const rows = await prisma.windsAnnouncement.findMany({
    where: { windsPageId },
    select: { entryTitle: true },
  });

  return new Set(rows.map((row) => row.entryTitle));
};

type EntryRef = {
  windsPageId: number;
  windsTitle: string;
  season: string | null;
  entry: WindsEntry;
};

// Record an entry as seen but not posted (announcedAt stays null). Idempotent on
// the (windsPageId, entryTitle) unique key.
export const recordSeenOnly = async (input: EntryRef): Promise<void> => {
  await prisma.windsAnnouncement.upsert({
    where: {
      windsPageId_entryTitle: {
        windsPageId: input.windsPageId,
        entryTitle: input.entry.entryTitle,
      },
    },
    create: {
      windsPageId: input.windsPageId,
      windsTitle: input.windsTitle,
      entryTitle: input.entry.entryTitle,
      season: input.season,
      matchedScopes: [],
      matchedKeywords: [],
    },
    update: {},
  });
};

// Record an entry as posted, stamping the raven, what it matched, and the id of
// the message that went out.
export const recordAnnounced = async (
  input: EntryRef & {
    persona: string;
    matchedScopes: string[];
    matchedKeywords: string[];
    discordMessageId: string;
  },
): Promise<void> => {
  const posted = {
    persona: input.persona,
    matchedScopes: input.matchedScopes,
    matchedKeywords: input.matchedKeywords,
    discordMessageId: input.discordMessageId,
    announcedAt: new Date(),
  };

  await prisma.windsAnnouncement.upsert({
    where: {
      windsPageId_entryTitle: {
        windsPageId: input.windsPageId,
        entryTitle: input.entry.entryTitle,
      },
    },
    create: {
      windsPageId: input.windsPageId,
      windsTitle: input.windsTitle,
      entryTitle: input.entry.entryTitle,
      season: input.season,
      ...posted,
    },
    update: posted,
  });
};
