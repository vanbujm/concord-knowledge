// The seed interest keywords and the world-context brief the ravens reason with.
//
// Keywords are the interest model: an entry is relevant if it matches a keyword
// or the LLM judges it related to one. Two tiers are seeded here: GENERAL
// keywords the whole Sablier Rouge warband shares, and PERSONAL keywords for
// Jonathan's character, Matteo Corvani. Members grow their own set at runtime via
// the /interests command. All keywords are stored and matched lower-cased.
//
// The lists are distilled from character-notes/lerona-mere-occultist-character.md
// and character-notes/lerona-mere-occultist-reading-list.md. Some entries are
// deliberately phrases rather than single words (e.g. "war affecting all
// warbands"): they rarely match literally, but the LLM reads them as a described
// interest and judges relatedness against the whole entry.

export const GENERAL_KEYWORDS: string[] = [
  "lerona mere",
  "the drowned",
  "mancante terra",
  "vidania",
  "sablier rouge",
  "la dove dormani",
  "warband",
  "war affecting all warbands",
  "warband activity in local regions",
];

export const PERSONAL_KEYWORDS: string[] = [
  "stallia",
  "the shardcircle",
  "deadspeaker",
  "waystone",
  "mandrianos",
  "graces",
  "necromancy",
  "the arcline",
  "arcane quarantine",
];

// Context handed to the LLM so it understands the setting and judges relatedness
// sensibly rather than pattern-matching bare strings.
export const WORLD_CONTEXT_BRIEF = `Concord is a fantasy LARP set in the world of Esterra, a battered empire of five realms. The reader belongs to The Sablier Rouge, a warband of the realm Lerona Mere, fighting the Drowned (reanimated "sunken souls" out of Vidania and the ruins of Mancante Terra) on the La Dove Dormani front. Matteo Corvani, the band's scholar-mage, is a devotee of Stallia (the sphere of stars, secrets and the dead) pursuing the arcane council, the Shardcircle.

The text you are reading is an entry from the "Winds of the World", an out-of-character seasonal newsletter of the Concord's wars, politics, and events. Judge which of the reader's registered keywords the entry genuinely relates to. Be generous with clear thematic links (a war in the band's region relates to "warband activity in local regions"; a threat to Lerona Mere relates to "lerona mere") but do not force a match where the connection is only incidental.`;
