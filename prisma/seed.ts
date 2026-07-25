import { prisma } from "@/db/client";
import { GENERAL_KEYWORDS, PERSONAL_KEYWORDS } from "@/discord/character";
import { GENERAL_SCOPE } from "@/discord/interests-store";

// Seeds two things into a fresh database: a placeholder Document so the search UI
// has something to read before the first ingest, and the ravens' starter interest
// keywords. Both are idempotent.

// Placeholder page. Real content arrives via the ingestion pipeline, whose
// incremental sync removes this page (its pageId is not a real wiki page).
const PLACEHOLDER_PAGE_ID = 999999;

// The Sablier Rouge (& Co.) guild. Overridable via DISCORD_GUILD_ID.
const DEFAULT_GUILD_ID = "1517374663188025455";

const seedPlaceholderDocument = async () => {
  await prisma.document.deleteMany({ where: { pageId: PLACEHOLDER_PAGE_ID } });

  const document = await prisma.document.create({
    data: {
      pageId: PLACEHOLDER_PAGE_ID,
      title: "Seed: The Iron Valley",
      sourceUrl: "https://wiki.concordlarp.com/index.php?title=The_Iron_Valley",
      lastRevId: 1,
      contentHash: "seed-iron-valley",
      categories: ["Realms of the Concord"],
      realm: "The Iron Valley",
      seasons: [],
      chunks: {
        create: [
          {
            ordinal: 0,
            headingPath: "The Iron Valley",
            text: "Protected from the world, the Valleyfolk stand together.",
            tokenCount: 10,
            charStart: 0,
            charEnd: 56,
          },
          {
            ordinal: 1,
            headingPath: "The Iron Valley > Five Things",
            text: "Legends, heroism and fortresses define the mountainfolk.",
            tokenCount: 9,
            charStart: 57,
            charEnd: 113,
          },
        ],
      },
    },
    include: { chunks: true },
  });

  console.log(
    `Seeded "${document.title}" with ${document.chunks.length} chunks.`,
  );
};

// Seed the general (band-wide) keywords always, and Jonathan's personal keywords
// when SEED_DISCORD_USER_ID is set (his Discord user id, obtained once at setup).
const seedInterests = async () => {
  const guildId = process.env.DISCORD_GUILD_ID ?? DEFAULT_GUILD_ID;
  const personalScope = process.env.SEED_DISCORD_USER_ID ?? null;

  const rows = [
    ...GENERAL_KEYWORDS.map((keyword) => ({ scope: GENERAL_SCOPE, keyword })),
    ...(personalScope
      ? PERSONAL_KEYWORDS.map((keyword) => ({ scope: personalScope, keyword }))
      : []),
  ];

  for (const row of rows) {
    const keyword = row.keyword.toLowerCase().trim();

    await prisma.interest.upsert({
      where: {
        guildId_scope_keyword: { guildId, scope: row.scope, keyword },
      },
      create: { guildId, scope: row.scope, keyword },
      update: {},
    });
  }

  const personalNote = personalScope
    ? ""
    : " (general only — set SEED_DISCORD_USER_ID to seed personal keywords)";

  console.log(
    `Seeded ${rows.length} interest keyword(s) for guild ${guildId}${personalNote}.`,
  );
};

const seed = async () => {
  await seedPlaceholderDocument();
  await seedInterests();
};

seed()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((seedError) => {
    console.error(seedError);
    process.exit(1);
  });
