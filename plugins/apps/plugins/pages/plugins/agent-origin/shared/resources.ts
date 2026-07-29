import { z } from "zod";
import { windowQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// One row per agent-created page. `source` is the script that minted it
// ("e2e:copy-paste-verify"); `createdAt` is both the window's order key and the
// sweep's age column.
export const AgentPageRowSchema = z.object({
  parentId: z.string(),
  source: z.string(),
  createdAt: z.coerce.date(),
});
export type AgentPageRow = z.infer<typeof AgentPageRowSchema>;

// Bounded ordered window (desc createdAt, default 200 / max 500) — NOT the
// unbounded `queryResource` the sibling `starred` plugin uses, which is legacy
// pending migration: a new DB-backed collection resource must be
// membership-bounded (CLAUDE.md / the bounded-working-set contract). The 24h TTL
// (see server/internal/sweep.ts) keeps the live set in single digits, so the
// 200-row window is never the binding constraint. Rows key on `parentId` (the
// side-table PK); the server half is compiled from the drizzle declaration in
// `server/internal/resource.ts`. Web consumers read it via `useWindowResource`;
// the wire shape stays `AgentPageRow[]`.
export const agentPagesResource = windowQueryResourceDescriptor<AgentPageRow>(
  "pages-origin",
  AgentPageRowSchema,
  "parentId",
  { defaultLimit: 200 },
);
