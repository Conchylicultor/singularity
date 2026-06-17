import { getTableColumns, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";
import { _agents } from "./tables";
import { defineView } from "@plugins/database/plugins/derived-views/core";

// Derived (plain) view. Lives in `views.ts` — NOT `schema.ts` — so the drizzle
// codegen glob never sees it: it is rebuilt from source on every boot via
// `defineView` + rebuildDerivedViews, never tracked in the migration chain. To
// change it, edit here and `./singularity build` — no migration is generated.
// See plugins/database/plugins/derived-views/CLAUDE.md.

export const agents = pgView("agents_v").as((qb) =>
  qb
    .select({
      ...getTableColumns(_agents),
      isFolder: sql<boolean>`(${_agents.prompt} IS NULL)`.as("is_folder"),
    })
    .from(_agents),
);

defineView({ view: agents });
