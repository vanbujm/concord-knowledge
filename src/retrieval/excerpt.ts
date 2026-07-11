// Build a bounded, highlighted excerpt of a chunk, centred on the query. The
// excerpt is what the surfaces show instead of the full chunk text, so the
// product stays "short quote + link to the wiki".

export type HighlightRange = { start: number; end: number };

export type Excerpt = {
  text: string;
  highlights: HighlightRange[];
};

const ELLIPSIS = "…";

// The distinct, meaningful lowercase words of a query, used for keyword
// matching and for highlighting.
export const queryTerms = (query: string): string[] => {
  const matches = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  return [...new Set(matches)].filter((term) => term.length >= 2);
};

const findHighlights = (text: string, terms: string[]): HighlightRange[] => {
  const ranges: HighlightRange[] = [];

  for (const term of terms) {
    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    let match = pattern.exec(text);

    while (match !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      match = pattern.exec(text);
    }
  }

  return ranges.sort((first, second) => first.start - second.start);
};

const earliestMatch = (lowerText: string, terms: string[]): number => {
  let earliest = -1;

  for (const term of terms) {
    const index = lowerText.indexOf(term);

    if (index !== -1 && (earliest === -1 || index < earliest)) {
      earliest = index;
    }
  }

  return earliest;
};

export const buildExcerpt = (input: {
  text: string;
  terms: string[];
  maxChars: number;
}): Excerpt => {
  const { text, terms, maxChars } = input;

  if (text.length <= maxChars) {
    return { text, highlights: findHighlights(text, terms) };
  }

  const anchor = Math.max(0, earliestMatch(text.toLowerCase(), terms));
  const maxStart = text.length - maxChars;

  let start = Math.min(Math.max(0, anchor - Math.floor(maxChars / 3)), maxStart);
  let end = Math.min(text.length, start + maxChars);

  // Pull each cut edge in to a word boundary, but only within a small window,
  // so the excerpt stays within maxChars and a text with no spaces still yields
  // a hard-capped result instead of collapsing or over-extending.
  const SNAP_WINDOW = 24;

  if (start > 0) {
    const nextSpace = text.indexOf(" ", start);

    if (nextSpace !== -1 && nextSpace - start <= SNAP_WINDOW) {
      start = nextSpace + 1;
    }
  }

  if (end < text.length) {
    const previousSpace = text.lastIndexOf(" ", end);

    if (previousSpace !== -1 && end - previousSpace <= SNAP_WINDOW && previousSpace > start) {
      end = previousSpace;
    }
  }

  const prefix = start > 0 ? ELLIPSIS : "";
  const suffix = end < text.length ? ELLIPSIS : "";
  const excerptText = `${prefix}${text.slice(start, end).trim()}${suffix}`;

  return { text: excerptText, highlights: findHighlights(excerptText, terms) };
};
