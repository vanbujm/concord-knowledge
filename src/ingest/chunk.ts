// Split a cleaned page into section-aware chunks.
//
// Strategy: a small page becomes a single chunk. A larger page is split on its
// headings (each chunk keeps the heading path it lives under); any section that
// is still too large is packed from its paragraphs into overlapping windows.
// Wiki tables (rendered as single-newline-separated rows, with no blank line
// inside) are treated as one atomic unit, so a table is never split mid-row.
//
// All work is done with character ranges over the cleaned text, so a chunk's
// `text` is exactly `cleaned.slice(charStart, charEnd)`.

export type PageChunk = {
  ordinal: number;
  headingPath: string;
  text: string;
  tokenCount: number;
  charStart: number;
  charEnd: number;
};

type Range = { start: number; end: number };

type Section = Range & { headingPath: string };

// Thresholds in characters, using a rough four-characters-per-token estimate.
const SINGLE_CHUNK_MAX_CHARS = 2000; // ~500 tokens: the whole page fits in one chunk
const TARGET_CHUNK_CHARS = 1600; // ~400 tokens
const CHUNK_OVERLAP_CHARS = 200; // ~50 tokens

const HEADING_PATTERN = /^(={2,6})\s*(.+?)\s*\1\s*$/;

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const rangeLength = (range: Range): number => range.end - range.start;

// Split the text into sections on its headings. Each section's range includes
// the heading line itself, so heading words stay searchable in the chunk, and
// `headingPath` is the full ancestry (e.g. "History > The Siege").
const splitIntoSections = (text: string): Section[] => {
  const sections: Section[] = [];
  const headingStack: Array<{ level: number; title: string }> = [];

  let sectionStart = 0;
  let sectionHeadingPath = "";
  let offset = 0;

  const closeSection = (end: number) => {
    if (end > sectionStart) {
      sections.push({
        headingPath: sectionHeadingPath,
        start: sectionStart,
        end,
      });
    }
  };

  for (const line of text.split("\n")) {
    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch) {
      closeSection(offset);

      const level = headingMatch[1].length;
      const title = headingMatch[2].replace(/\s+/g, " ").trim();

      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }

      headingStack.push({ level, title });
      sectionHeadingPath = headingStack.map((entry) => entry.title).join(" > ");
      sectionStart = offset;
    }

    offset += line.length + 1;
  }

  closeSection(text.length);

  return sections;
};

// Paragraph ranges within [start, end), split on blank lines.
const findParagraphRanges = (
  text: string,
  start: number,
  end: number,
): Range[] => {
  const region = text.slice(start, end);
  const ranges: Range[] = [];
  const separator = /\n{2,}/g;

  let cursor = 0;
  let match = separator.exec(region);

  while (match !== null) {
    if (match.index > cursor) {
      ranges.push({ start: start + cursor, end: start + match.index });
    }

    cursor = match.index + match[0].length;
    match = separator.exec(region);
  }

  if (cursor < region.length) {
    ranges.push({ start: start + cursor, end });
  }

  return ranges;
};

// Split one long prose paragraph into sentence-grouped ranges, each within the
// target size.
const splitIntoSentenceRanges = (
  text: string,
  start: number,
  end: number,
): Range[] => {
  const region = text.slice(start, end);
  const boundary = /[.!?]\s+/g;

  const sentences: Range[] = [];
  let cursor = 0;
  let match = boundary.exec(region);

  while (match !== null) {
    const sentenceEnd = match.index + match[0].length;
    sentences.push({ start: cursor, end: sentenceEnd });
    cursor = sentenceEnd;
    match = boundary.exec(region);
  }

  if (cursor < region.length) {
    sentences.push({ start: cursor, end: region.length });
  }

  const ranges: Range[] = [];
  let windowStart: number | null = null;
  let windowEnd = 0;

  for (const sentence of sentences) {
    if (windowStart === null) {
      windowStart = sentence.start;
      windowEnd = sentence.end;
      continue;
    }

    if (sentence.end - windowStart > TARGET_CHUNK_CHARS) {
      ranges.push({ start: start + windowStart, end: start + windowEnd });
      windowStart = sentence.start;
      windowEnd = sentence.end;
    } else {
      windowEnd = sentence.end;
    }
  }

  if (windowStart !== null) {
    ranges.push({ start: start + windowStart, end: start + windowEnd });
  }

  return ranges;
};

// The atomic units of a section: paragraphs, except that an over-long prose
// paragraph is broken into sentence groups, while a table/list block (any
// paragraph containing a newline) is kept whole so it is never split.
const buildAtomicUnits = (
  text: string,
  start: number,
  end: number,
): Range[] => {
  const units: Range[] = [];

  for (const paragraph of findParagraphRanges(text, start, end)) {
    const paragraphText = text.slice(paragraph.start, paragraph.end);

    if (
      rangeLength(paragraph) <= TARGET_CHUNK_CHARS ||
      paragraphText.includes("\n")
    ) {
      units.push(paragraph);
    } else {
      units.push(
        ...splitIntoSentenceRanges(text, paragraph.start, paragraph.end),
      );
    }
  }

  return units;
};

// Greedily pack units into windows near the target size, then start the next
// window a little earlier so consecutive chunks overlap.
const packWithOverlap = (units: Range[]): Range[] => {
  const windows: Range[] = [];
  let start = 0;

  while (start < units.length) {
    let end = start;
    let length = 0;

    while (end < units.length) {
      const unitLength = rangeLength(units[end]);

      if (length > 0 && length + unitLength > TARGET_CHUNK_CHARS) {
        break;
      }

      length += unitLength;
      end += 1;
    }

    windows.push({ start: units[start].start, end: units[end - 1].end });

    if (end >= units.length) {
      break;
    }

    let overlapStart = end;
    let overlapLength = 0;

    for (let index = end - 1; index > start; index -= 1) {
      const unitLength = rangeLength(units[index]);

      if (overlapLength + unitLength > CHUNK_OVERLAP_CHARS) {
        break;
      }

      overlapLength += unitLength;
      overlapStart = index;
    }

    start = overlapStart > start ? overlapStart : end;
  }

  return windows;
};

// Trim a range to its non-whitespace bounds and build a chunk, or null if the
// range is entirely whitespace.
const makeChunk = (
  text: string,
  headingPath: string,
  rawStart: number,
  rawEnd: number,
  ordinal: number,
): PageChunk | null => {
  let start = rawStart;
  let end = rawEnd;

  while (start < end && /\s/.test(text[start])) {
    start += 1;
  }

  while (end > start && /\s/.test(text[end - 1])) {
    end -= 1;
  }

  if (end <= start) {
    return null;
  }

  const chunkText = text.slice(start, end);

  return {
    ordinal,
    headingPath,
    text: chunkText,
    tokenCount: estimateTokens(chunkText),
    charStart: start,
    charEnd: end,
  };
};

export const chunkPage = (cleanedText: string): PageChunk[] => {
  const chunks: PageChunk[] = [];

  const push = (headingPath: string, rawStart: number, rawEnd: number) => {
    const chunk = makeChunk(cleanedText, headingPath, rawStart, rawEnd, chunks.length);

    if (chunk) {
      chunks.push(chunk);
    }
  };

  if (cleanedText.length <= SINGLE_CHUNK_MAX_CHARS) {
    push("", 0, cleanedText.length);
    return chunks;
  }

  for (const section of splitIntoSections(cleanedText)) {
    if (rangeLength(section) <= SINGLE_CHUNK_MAX_CHARS) {
      push(section.headingPath, section.start, section.end);
      continue;
    }

    const units = buildAtomicUnits(cleanedText, section.start, section.end);

    for (const window of packWithOverlap(units)) {
      push(section.headingPath, window.start, window.end);
    }
  }

  return chunks;
};
