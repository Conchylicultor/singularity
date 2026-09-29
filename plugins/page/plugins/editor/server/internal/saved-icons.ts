import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineSavedIconSource } from "@plugins/ui/plugins/icons/plugins/sprites/server";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import {
  nullable,
  parsed,
} from "@plugins/database/plugins/sql-projection/server";
import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { liveBlocks } from "./live-blocks";

const iconExpr = sql`${liveBlocks.data} ->> 'icon'`.mapWith(
  nullable(parsed(SavedSymbolNameSchema, "saved-icons.icon")),
);

/** Every live page's saved icon, so page icons are drawable at first paint. */
export const pageIconsSource = defineSavedIconSource({
  id: "page.page-icons",
  names: async () =>
    (
      await db
        .selectDistinct({ icon: iconExpr })
        .from(liveBlocks)
        .where(and(eq(liveBlocks.type, PAGE_BLOCK_TYPE), isNotNull(iconExpr)))
    ).flatMap((r) => (r.icon === null ? [] : [r.icon])),
});
