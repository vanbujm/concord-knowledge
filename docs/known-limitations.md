# Known limitations

Deliberate trade-offs and unresolved calls, recorded so they are not rediscovered
from scratch. Each one names the code it concerns.

## Old Winds sub-pages can appear as retrieved background

`src/discord/background.ts`

Old Winds sub-pages can still appear. `Much That Once Was Is Lost` came through,
because the filter excludes titles starting with "Winds of the World" and entry
sub-pages have their own titles. These are in-character narrative that could be
misread as current news. The `seasons` facet would filter them, but it would also
drop genuinely useful season-tagged material like `Historic Research - Summer 221`,
which was good background here.

**Unresolved:** whether that trade is worth making.

## The entity-title floor keeps some common words

`src/discord/background.ts`

Entities are detected by matching the corpus's own page titles against an entry's
text. The minimum title length has to stay at six characters to keep real names
such as `Andash`, which means six-character common words such as `Combat` pass the
filter too. Ordering matches longest-first and capping how many go into the query
keeps them out of the way in practice rather than by rule.
