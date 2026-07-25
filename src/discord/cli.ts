import { prisma } from "@/db/client";
import { runPoll } from "@/discord/poll";
import { logEvent } from "@/log";

// Entrypoint for the scheduled Winds watcher. Runs under Bun (locally or in CI),
// never on Vercel. Pass --backfill to record the current season's entries as
// seen without posting, resetting the baseline.

const main = async () => {
  const backfill = process.argv.includes("--backfill");

  logEvent("discord_poll_cli_start", { backfill });

  await runPoll({ backfill });
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
