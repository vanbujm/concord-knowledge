-- The invented pageType taxonomy (rules/lore/newsletter/...) is replaced by the
-- wiki's own categories for filtering. categories is already stored, so this
-- only drops the derived column and its index.

-- DropIndex
DROP INDEX "Document_pageType_idx";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "pageType";
