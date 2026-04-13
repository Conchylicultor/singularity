# Adopt drizzle-zod for API boundary validation

## Context

Today the `Conversation` DTO lives in `plugins/conversations/shared/types.ts` and
is duplicated structurally with the Drizzle row from `plugins/conversations/server/schema.ts`.
DB rows are sent over HTTP via `Response.json(row)` — `Date` fields become ISO
strings on the wire, but no TS or runtime type reflects that transformation.
Consumers currently paper over it (e.g. `new Date(iso).getTime()` works on both
`Date` and `string`), but the mismatch is a latent footgun and duplicated
type definitions are an ongoing maintenance tax as more plugins add tables.

We also have no runtime validation at API boundaries. If an external caller
(or a migration we forgot to run) sends back a row with an unknown `status`
value, TS happily hands us a typed `ConversationStatus` that is a lie.

## Proposal

Adopt [`drizzle-zod`](https://orm.drizzle.team/docs/zod) as the single source
of truth for:
- API request/response shape validation,
- derived TS types on both server and client,
- Date coercion at the JSON boundary.

### What it looks like

```ts
// plugins/conversations/server/schema.ts
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ConversationSchema = createSelectSchema(conversations, {
  status: z.enum(["starting", "working", "needs_attention", "completed", "obsolete"]),
  createdAt: z.coerce.date(),  // accepts ISO string or Date
  updatedAt: z.coerce.date(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
```

- Server handlers return `Response.json(row)` — unchanged; the wire shape is
  still ISO strings.
- Client parses with the same schema:
  ```ts
  const conv = ConversationSchema.parse(await res.json());
  // conv.createdAt is Date, conv.status is narrowed
  ```
- `z.infer` gives a single `Conversation` type used by both ends. Delete
  `shared/types.ts` (or keep it only for types not tied to a table).

Zod schemas are pure TS — `import type { Conversation }` in web code remains
tree-shakable. Runtime `.parse()` calls stay on whichever side does validation
(typically client on fetch, server on inbound POST/PATCH bodies).

## Scope of adoption

Pilot scope is `plugins/conversations/server/schema.ts` only. Broader rollout
to other table-defining plugins is deferred until the original triggers fire
(see "Status" below).

Note: the `createInsertSchema` POST-body angle below has no target in the
pilot — `conversations` has no JSON request bodies today (`handleDelete` uses
a `?name=` query param). Kept for reference for future plugins.

## Cost

- Dev deps: `zod`, `drizzle-zod` (both small, pure TS).
- One migration PR per plugin to swap hand-rolled types → inferred.
- `createInsertSchema` is the natural place to validate `POST` bodies, replacing
  ad-hoc `if (!name || !/.../.test(name))` checks (see `handle-delete.ts`).

## Non-goals / out of scope

- Pushing Zod schemas into non-DB contracts (plugin slot payloads, shell
  commands). Drizzle-zod is valuable because it rides on top of an existing
  source of truth (the table). Unrelated contracts don't benefit from it and
  should be addressed separately if validation is needed.
- Changing the wire format. Dates remain ISO strings; only the client-side
  parsed type changes.

## Status

**Executing for `conversations` only.** Broader repo-wide rollout remains
deferred pending the triggers below.

## Trigger to revisit (for broader rollout)

- First external API consumer (agent sending data back), OR
- First bug caused by the Date-string / Date type mismatch, OR
- Third plugin adding a table with a hand-rolled DTO.
