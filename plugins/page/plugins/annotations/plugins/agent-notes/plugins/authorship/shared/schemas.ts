import { z } from "zod";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One authorship record: a conversation that wrote into an agent-notes card,
// and when it first did. `conversationId` may DANGLE — the record outlives the
// conversation row on purpose (see the table's comment) — so a reader must
// tolerate an id that resolves to nothing.
export const AgentNotesAuthorSchema = z.object({
  blockId: z.string(),
  conversationId: z.string(),
  createdAt: z.coerce.date(),
});
export type AgentNotesAuthor = z.infer<typeof AgentNotesAuthorSchema>;

// The authors of ONE agent-notes card, oldest-first.
//
// Keyed with `{ blockId }` params — POINT membership, so the working set is
// bounded by construction: only a MOUNTED card subscribes, and a FULL load is
// that one card's handful of authors. It never grows with the collection, so
// this is not the legacy unbounded `queryResource` collection shape (see the
// bounded-working-set contract in the root CLAUDE.md); `page-block-doc` is the
// precedent it copies.
//
// NOT bootCritical: the anchor mounts route-scoped with the page, so it hydrates
// post-mount via its sub-ack — same call `prompt-block-tasks` makes.
//
// Rows key on `conversationId`, which is unique within one block by the
// underlying composite primary key.
export const agentNotesAuthorsResource = keyedResourceDescriptor<
  AgentNotesAuthor[],
  { blockId: string }
>(
  "agent-notes-authors",
  z.array(AgentNotesAuthorSchema),
  [],
  (row) => (row as AgentNotesAuthor).conversationId,
);
