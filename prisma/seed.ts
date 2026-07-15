import { prisma } from "@/db/client";

// Starter seed: one Document with two Chunks, so a fresh database has something
// to read. Real content arrives via the ingestion pipeline (CON-7..CON-9),
// whose incremental sync will remove this placeholder page (its pageId is not
// a real wiki page). Idempotent: the placeholder is cleared before re-inserting.
const PLACEHOLDER_PAGE_ID = 999999;

const seed = async () => {
  await prisma.document.deleteMany({ where: { pageId: PLACEHOLDER_PAGE_ID } });

  const document = await prisma.document.create({
    data: {
      pageId: PLACEHOLDER_PAGE_ID,
      title: "Seed: The Iron Valley",
      sourceUrl:
        "https://wiki.concordlarp.com/index.php?title=The_Iron_Valley",
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

seed()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((seedError) => {
    console.error(seedError);
    process.exit(1);
  });
