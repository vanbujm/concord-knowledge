// The two ravens. Each message the bot sends is authored by one of them,
// rendered as the embed's author line (name + icon), so a single bot account can
// still speak with two distinct voices. The LLM is handed both voice briefs and
// picks which raven fits a given message.
//
// The names are Italian: "diceria" is rumour or gossip, "ricordo" is memory or
// remembrance. Both sit under Stallia, the sphere of secrets and the dead.

export type PersonaKey = "diceria" | "ricordo";

export type Persona = {
  key: PersonaKey;
  name: string;
  // A public image URL for the embed author icon. Optional: when unset the embed
  // simply shows the name with no icon.
  avatarUrl: string | undefined;
  // Discord embed accent colour, as a 24-bit integer.
  color: number;
  // A short description of the raven's voice, dropped into the LLM system prompt.
  voiceBrief: string;
};

export const PERSONAS: Record<PersonaKey, Persona> = {
  diceria: {
    key: "diceria",
    name: "Diceria",
    avatarUrl: process.env.DICERIA_AVATAR_URL || undefined,
    color: 0x8a1c1c,
    voiceBrief:
      "Diceria is the raven of rumour and gossip. She speaks the way tidings pass " +
      "between tavern houses: quick, sly, a little conspiratorial, delighting in " +
      "what is stirring and who it troubles. She carries fresh news and current " +
      "events. Keep her lively and knowing, never solemn.",
  },
  ricordo: {
    key: "ricordo",
    name: "Ricordo",
    avatarUrl: process.env.RICORDO_AVATAR_URL || undefined,
    color: 0x2e2a4a,
    voiceBrief:
      "Ricordo is the raven of memory and remembrance. He speaks with the weight " +
      "of the archive: measured, precise, a touch elegiac, mindful of how the " +
      "present rhymes with what has gone before. He suits recollection, lore, and " +
      "the long view. Keep him grave and exact, never chatty.",
  },
};

export const PERSONA_KEYS: PersonaKey[] = ["diceria", "ricordo"];

export const getPersona = (key: PersonaKey): Persona => PERSONAS[key];
