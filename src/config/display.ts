// Display and retrieval limits shared by both surfaces (web UI and MCP).
//
// MAX_EXCERPT_CHARS bounds how much page text we ever return, keeping the
// product to short cited excerpts plus a deep link rather than republishing
// wiki pages. FULL_TEXT_ENABLED can loosen that if the wiki owner grants
// permission; it is off by default.

export const MAX_EXCERPT_CHARS = 320;
export const FULL_TEXT_ENABLED = false;

// The longest search query any surface accepts. Every query costs an embedding
// pass and a ranked SQL query, so an unbounded one is free compute for whoever
// sends it. Real queries are a handful of words; this is generous for those and
// still refuses a megabyte of text.
export const MAX_QUERY_CHARS = 300;

export const DEFAULT_RESULT_LIMIT = 10;
export const MAX_RESULT_LIMIT = 25;
