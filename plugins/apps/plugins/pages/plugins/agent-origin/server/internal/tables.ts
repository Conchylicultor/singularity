import { text } from "drizzle-orm/pg-core";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _blocks } from "@plugins/page/plugins/editor/server";

// `page_blocks_ext_origin`: presence = the page was created by an automated
// session (`x-singularity-origin: agent`). `source` records WHICH one, e.g.
// "e2e:copy-paste-verify" — enough to trace a stray page back to the script
// that minted it. A user-created page has no row at all; the field projects
// "user" for it (see web/components/origin-field.tsx), so the absence is a
// value, never a hole.
export const pageBlocksOrigin = defineExtension(
  _blocks,
  "origin",
  {
    source: text("source").notNull(),
  },
  {
    // The nightly sweep scans by age, not by `parent_id` — the PK's implicit
    // btree covers nothing here, so the age column gets its own index.
    indexes: (t, b) => [b.index("created_at").on(t.createdAt)],
  },
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _pageBlocksOriginExt = pageBlocksOrigin.table;
