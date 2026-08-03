import { prisma } from "@/db/client";
import { runPoll } from "@/discord/poll";
import { logEvent } from "@/log";

// Entrypoint for the scheduled Winds watcher. Runs under Bun (locally or in CI),
// never on Vercel.
//
//   --backfill          record the current season's entries as seen without
//                       posting, resetting the baseline
//   --dry-run           compose and print dispatches, posting nothing and
//                       writing nothing to the database
//   --season "Name"     watch a named season ("Autumn 226") instead of the
//                       newest, to preview against one that has been written
//   --limit N           how many entries a dry run composes (default 1)

const readFlagValue = (flag: string): string | null => {
  const flagIndex = process.argv.indexOf(flag);

  if (flagIndex === -1) {
    return null;
  }

  return process.argv[flagIndex + 1] ?? null;
};

const main = async () => {
  const backfill = process.argv.includes("--backfill");
  const dryRun = process.argv.includes("--dry-run");
  const season = readFlagValue("--season");

  const limitValue = readFlagValue("--limit");
  const limit = limitValue === null ? undefined : Number(limitValue);

  if (limit !== undefined && !Number.isInteger(limit)) {
    throw new Error(`--limit must be a whole number, got "${limitValue}"`);
  }

  logEvent("discord_poll_cli_start", { backfill, dryRun, season, limit });

  await runPoll({ backfill, dryRun, season, limit });
};

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((pollError) => {
    logEvent("discord_poll_failed", {
      error: pollError instanceof Error ? pollError.message : String(pollError),
    });
    console.error(pollError);
    process.exit(1);
  });
