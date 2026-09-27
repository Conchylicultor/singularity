import type { z } from "zod";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// One row per agent-created page, in the `page_blocks_ext_origin`
// entity-extension table that `server/internal/tables.ts` builds from this
// shape. `source` is the script that minted it ("e2e:copy-paste-verify");
// `createdAt` is both the window's order key and the sweep's age column.
export const agentPageShape = defineExtensionShape({
  key: "blockId",
  fields: { source: textField() },
  wireTimestamps: ["createdAt"],
});
export const AgentPageRowSchema = agentPageShape.schema;
export type AgentPageRow = z.infer<typeof AgentPageRowSchema>;

// The marker set, as a bounded ordered window (desc createdAt, default 200 /
// max 500): a DB-backed collection is membership-bounded by construction. The
// sibling `starred` plugin is the same shape on a bigger window — its favorites
// have no TTL. The 24h TTL (see server/internal/sweep.ts) keeps the live set in
// single digits, so the 200-row window is never the binding constraint. Nothing
// filters it (`filterable: {}`): the one reader wants the whole set. Rows key on
// `blockId` (the side-table PK — the marked page's id); the server half is
// served from the extension handle in `server/internal/resource.ts`. The one
// reader is `OriginField`, via `useLive(agentPages)`.
export const agentPages = liveCollection("pages-origin", {
  row: AgentPageRowSchema,
  id: "blockId",
  filterable: {},
  sortable: ["createdAt"],
  default: { orderBy: [["createdAt", "desc"]], limit: 200 },
  maxLimit: 500,
});
