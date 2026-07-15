import { Fragment, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { HighlightRange } from "@/retrieval/excerpt";
import type { SearchResult } from "@/retrieval/hybrid-search";

// Renders the matched excerpt with the query terms wrapped in <mark>. The
// highlight ranges are character offsets into `text`, already sorted; we walk
// them in order, emitting the plain gap before each range and the marked slice
// for the range itself.
const renderHighlighted = (
  text: string,
  highlights: HighlightRange[],
): ReactNode => {
  if (highlights.length === 0) {
    return text;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  for (const [index, range] of highlights.entries()) {
    const start = Math.max(range.start, cursor);

    if (start >= range.end) {
      continue;
    }

    if (start > cursor) {
      segments.push(
        <Fragment key={`gap-${index}`}>{text.slice(cursor, start)}</Fragment>,
      );
    }

    segments.push(
      <mark
        key={`mark-${index}`}
        className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground"
      >
        {text.slice(start, range.end)}
      </mark>,
    );

    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  }

  return segments;
};

export const ResultCard = ({ result }: { result: SearchResult }) => {
  const breadcrumb = result.headingPath
    ? result.headingPath.split(" > ")
    : [];

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{result.title}</CardTitle>

          {result.categories.length > 0 ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {result.categories.map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {breadcrumb.length > 0 ? (
          <nav
            aria-label="Section"
            className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumb.map((segment, index) => (
              <Fragment key={`${segment}-${index}`}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span>{segment}</span>
              </Fragment>
            ))}
          </nav>
        ) : null}
      </CardHeader>

      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {renderHighlighted(result.excerpt, result.highlights)}
        </p>
      </CardContent>

      <CardFooter className="border-t-0 bg-transparent pt-0">
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          View on wiki
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </CardFooter>
    </Card>
  );
};
