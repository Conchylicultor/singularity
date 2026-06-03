import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _documents } from "@plugins/page/plugins/editor/server";
import { BacklinkRowSchema } from "../../core/schemas";
import { backlinksResource as backlinksDescriptor } from "../../core/resources";
import type { BacklinkRow } from "../../core/schemas";
import { _pageLinks } from "./tables";

// Push resource: lists the source pages that link TO `pageId`, ordered by
// title. Notified by the reindexer for every affected target.
export const backlinksResource = defineResource<BacklinkRow[], { pageId: string }>({
  key: backlinksDescriptor.key,
  mode: "push",
  schema: z.array(BacklinkRowSchema),
  loader: async ({ pageId }) =>
    db
      .select({
        id: _documents.id,
        title: _documents.title,
        icon: _documents.icon,
      })
      .from(_pageLinks)
      .innerJoin(_documents, eq(_pageLinks.sourceDocumentId, _documents.id))
      .where(eq(_pageLinks.targetDocumentId, pageId))
      .orderBy(asc(_documents.title)) as unknown as Promise<BacklinkRow[]>,
});
