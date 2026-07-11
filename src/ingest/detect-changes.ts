// Cheap change-detection for the daily ingest. It compares the wiki's current
// page revisions against what the database already holds, so a run on a day when
// nothing changed can skip the expensive model load and content fetch entirely.

// Count the pages that are new, changed, or removed between the wiki and the
// store. Both maps are keyed by page id and hold the latest revision id.
export const countRevisionChanges = (input: {
  wiki: Map<number, number>;
  stored: Map<number, number>;
}): number => {
  const { wiki, stored } = input;

  let changed = 0;

  for (const [pageId, revisionId] of wiki) {
    if (stored.get(pageId) !== revisionId) {
      changed += 1;
    }
  }

  for (const pageId of stored.keys()) {
    if (!wiki.has(pageId)) {
      changed += 1;
    }
  }

  return changed;
};
