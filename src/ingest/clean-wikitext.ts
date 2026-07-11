// Turn raw MediaWiki wikitext into clean, searchable text.
//
// Two things are deliberately preserved: heading lines (`== ... ==`), so the
// chunker can split on them, and wiki tables, which are rendered into readable
// "Header: value" lines so that skill costs, spell effects, and event rows stay
// searchable rather than being dropped as markup.

const TYPOGRAPHIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[‘’‚‛]/g, "'"], // curly single quotes / apostrophes
  [/[“”„‟]/g, '"'], // curly double quotes
  [/[–—]/g, "-"], // en dash / em dash
  [/…/g, "..."], // ellipsis
  [/ /g, " "], // non-breaking space
];

const normalizeTypography = (input: string): string => {
  let output = input;

  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  return output;
};

// Remove {{...}} templates, including {{#ev:...}} media embeds. Runs repeatedly
// so nested templates collapse from the inside out. Wiki tables use `{|`, not
// `{{`, so they are left untouched here.
const removeTemplates = (input: string): string => {
  let output = input;
  let previous = "";

  while (output !== previous) {
    previous = output;
    output = output.replace(/\{\{[^{}]*\}\}/g, "");
  }

  return output;
};

const collapseWhitespace = (cell: string): string => cell.replace(/\s+/g, " ").trim();

// Render a single `{| ... |}` table into readable lines. Header cells (`!`) are
// paired with each data row's cells so a row reads "Name: Juggernaut. Cost:
// 2/4/6/8"; empty cells are dropped. Cell contents have already had their links
// unwrapped and emphasis stripped by the time this runs.
const renderWikitable = (tableBlock: string): string => {
  const lines = tableBlock.split("\n");

  const headers: string[] = [];
  const rows: string[][] = [];
  let currentRow: string[] = [];

  const flushRow = () => {
    if (currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (
      line.startsWith("{|") ||
      line.startsWith("|}") ||
      line.startsWith("|+")
    ) {
      continue;
    }

    if (line.startsWith("|-")) {
      flushRow();
      continue;
    }

    if (line.startsWith("!")) {
      headers.push(...line.slice(1).split("!!").map(collapseWhitespace));
      continue;
    }

    if (line.startsWith("|")) {
      currentRow.push(...line.slice(1).split("||").map(collapseWhitespace));
      continue;
    }

    // A line with no table marker is a continuation of the previous cell.
    if (currentRow.length > 0) {
      const lastIndex = currentRow.length - 1;
      currentRow[lastIndex] = collapseWhitespace(
        `${currentRow[lastIndex]} ${line}`,
      );
    }
  }

  flushRow();

  const renderedRows = rows.map((row) =>
    row
      .map((cell, index) => {
        const value = cell.trim();

        if (!value) {
          return "";
        }

        const header = headers[index]?.trim();

        return header ? `${header}: ${value}` : value;
      })
      .filter((part) => part.length > 0)
      .join(". "),
  );

  return renderedRows.filter((row) => row.length > 0).join("\n");
};

const renderWikitables = (input: string): string =>
  input.replace(
    /\{\|[\s\S]*?\|\}/g,
    (tableBlock) => `\n${renderWikitable(tableBlock)}\n`,
  );

export const cleanWikitext = (raw: string): string => {
  let text = normalizeTypography(raw);

  // Structural noise: comments, footnotes, transcluded index tabs.
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<ref[^>]*\/>/g, "");
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  text = text.replace(/<tabbertransclude>[\s\S]*?<\/tabbertransclude>/g, "");

  // Line breaks and block quotes: keep the text, drop the tags.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?blockquote>/gi, "");

  text = removeTemplates(text);

  // Media and bookkeeping links (categories come from the API separately).
  text = text.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "");
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, "");

  // Internal links: [[Target|Display]] -> Display, [[Target]] -> Target.
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // External links: [https://url label] -> label, [https://url] -> dropped.
  text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1");
  text = text.replace(/\[https?:\/\/[^\s\]]+\]/g, "");

  // Emphasis markers are runs of 2+ apostrophes ('' italic, ''' bold).
  text = text.replace(/'{2,}/g, "");

  text = renderWikitables(text);

  // Any residual HTML tags, list/indent markers, magic words, and rules.
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/^[*#:;]+[ \t]*/gm, "");
  text = text.replace(/__[A-Z]+__/g, "");
  text = text.replace(/^-{4,}[ \t]*$/gm, "");

  // Tidy whitespace: no trailing spaces, single spaces, at most one blank line.
  text = text.replace(/[^\S\n]{2,}/g, " ");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
};
