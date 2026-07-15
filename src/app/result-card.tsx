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
import { categoryFeedsRealmOrSphere } from "@/ingest/derive-facets";
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

  // The facet tags a result carries, so a card is self-describing and shows why
  // it matched a filter. The explicit wiki categories are filled; the derived
  // facets (realm, sphere, season) are outlined, with seasons muted as context.
  //
  // Skip categories the realm or sphere badge already shows (e.g. a "Panoply"
  // category alongside the "Panoply" sphere) so the row does not repeat itself.
  const visibleCategories = result.categories.filter(
    (category) => !categoryFeedsRealmOrSphere(category),
  );

  const hasTags =
    result.realm !== null ||
    result.sphere !== null ||
    visibleCategories.length > 0 ||
    result.seasons.length > 0;

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{result.title}</CardTitle>

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

        {hasTags ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {result.realm !== null ? (
              <Badge variant="outline">{result.realm}</Badge>
            ) : null}

            {result.sphere !== null ? (
              <Badge variant="outline">{result.sphere}</Badge>
            ) : null}

            {visibleCategories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}

            {result.seasons.map((season) => (
              <Badge
                key={season}
                variant="outline"
                className="text-muted-foreground"
              >
                {season}
              </Badge>
            ))}
          </div>
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
