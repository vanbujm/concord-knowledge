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

// How the world is arranged, as opposed to who the reader is. The phrase-style
// keywords cannot be judged without it: an entry about a war in Mukarrem is not
// "warband activity in local regions" unless you know Mukarrem is Andash's front,
// half a world from Lerona Mere.
//
// Assembled from the corpus rather than from memory: the fronts and the foes each
// realm faces come from the tag lines of every Winds of the World page, which name
// the realms a given war affects; the outside powers come from
// `Distant Foreign Powers`; the local geography from `Lerona Mere (The Region)`.
// Worth refreshing when the realms' fronts shift, which is roughly once a year.
export const CONCORD_GAZETTEER = `Fronts of the Concord's wars, and the realms that fight on them:
- Mancante Terra: Lerona Mere
- Bolsterlee: The Iron Valley and Lerona Mere
- King's Pass, Windholme: The Iron Valley
- The Steinvaults: The Iron Valley and the Kingdom of Bordevar
- Mukarrem: Andash
- The Tribelands: Andash and the Greenweald Baronies
- Resinderholz: the Greenweald Baronies and the Kingdom of Bordevar
- Vassertal: the Greenweald Baronies
- Weiland: the Kingdom of Bordevar

The Concord's enemies, and who faces them:
- The Drowned, reanimated sunken souls out of Vidania and the ruins of Mancante Terra: Lerona Mere
- The Illsevir, seaborne raiders whose war barges came ashore in Mancante Terra, and whose coming is said to be heralded by the storms that roll up off the Icereach: Lerona Mere
- The Trade Principality of Aprivano: Andash
- The Zekartaal: Andash and the Greenweald Baronies
- The Severed Lords: The Iron Valley
- The Boar's Head Clan: Windholme and Weiland
- The Onyx Aristocracy: Resinderholz and Weiland

Powers outside the Concord:
- The Artebazzani Empire, a wealthy conquering empire of legions in steel lorica. It held Lerona Mere as its farthest colony until the revolution threw it off, so what the Artebazzani do matters intensely to Lerona Mere whether or not they are anywhere near it.
- The Fealties of Drummond, a feudal kingdom of rival houses on Hildeblanc, the continent east of Esterra, and the homeland of the Bordevarians.
- The Idrian Cabal, a few score isolated wizard-priests in ice spires far to the south.
- The Xan Khanate, nomads who raid the eastern Artebazzani frontier mounted on horses.

The region of Lerona Mere, which is what "local" means for this warband. The city itself holds four districts: the North Wards, the Redbrick District, the Crux Patricus and the Docklands. Outside it lie the mining town of Mivara and the border town of Gafroza, the farmland of the Madre Campo and the hard ground of Est Speranza, the Hunters Wood and the Southern Greenweald, the heights of the Lungo Elsa and the Western Steinvault Mountains, and the waters of the Bay of Promised Gold, Lake Isabella and the Fiorenza River. The Fiorenza is the region's western border and now a frontline, with Mancante Terra beyond it. Gafroza is the waystation on the road towards Bolsterlee.`;
