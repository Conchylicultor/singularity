import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { BacklinkRowSchema } from "../../core/schemas";
import { backlinksResource as backlinksDescriptor } from "../../core/resources";
import type { BacklinkRow } from "../../core/schemas";
import { _pageLinks } from "./tables";

// `data->>'title'` / `data->>'icon'`: the source page's title/icon live in the
// `type="page"` block's `data` JSON.
const titleExpr = sql<string>`${_blocks.data} ->> 'title'`;
const iconExpr = sql<string | null>`${_blocks.data} ->> 'icon'`;

// Push resource: lists the source pages that link TO `pageId`, ordered by
// title. Notified by the reindexer for every affected target.
export const backlinksResource = defineResource<BacklinkRow[], { pageId: string }>({
  key: backlinksDescriptor.key,
  mode: "push",
  schema: z.array(BacklinkRowSchema),
  loader: async ({ pageId }) =>
    db
      .select({
        id: _blocks.id,
        title: titleExpr,
        icon: iconExpr,
      })
      .from(_pageLinks)
      .innerJoin(_blocks, eq(_pageLinks.sourcePageId, _blocks.id))
      .where(eq(_pageLinks.targetPageId, pageId))
      .orderBy(asc(titleExpr)) as unknown as Promise<BacklinkRow[]>,
});
