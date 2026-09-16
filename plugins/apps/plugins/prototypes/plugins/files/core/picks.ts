import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { isOptionName, isOptionValue } from "./options";

// The wire half of a prototype's option picks: which variant of each option
// the user has picked, ONE record per prototype, shared by every surface that
// shows it (main, every worktree deploy, every browser). The store itself — a
// JSON file per prototype under the data dir's `_picks/` — is Node-only and
// lives in `shared/picks.ts`; this is what the browser reads and writes.
//
// Design: `research/2026-09-16-global-shared-prototype-option-picks.md`.

/**
 * The picks as STORED, keyed by option name — raw: checked against the token
 * grammar (`isOptionName` / `isOptionValue`), never against a declaration. A
 * pick can target an option only a recorded version declares, so the live
 * page's options cannot judge it. Every read still goes through
 * `resolvePicks`, which keeps the picks the document on screen declares and
 * drops the rest.
 */
export type StoredPicks = Readonly<Record<string, string>>;

const OptionNameSchema = z
  .string()
  .refine(
    isOptionName,
    "not an option name (lowercase letters, digits and dashes, starting with a letter; `v` is reserved)",
  );
const OptionValueSchema = z
  .string()
  .refine(
    isOptionValue,
    "not an option value (lowercase letters, digits and dashes)",
  );

export const StoredPicksSchema = z.record(
  OptionNameSchema,
  OptionValueSchema,
) satisfies ZodParser<StoredPicks>;

/**
 * One change to a prototype's picks. One change, never the whole record: two
 * surfaces picking different options at once must not overwrite each other.
 *
 * - `set` — pick `value` for `option` (the other options keep theirs).
 * - `reset` — forget every pick; the page shows its authored defaults.
 */
export const PicksChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("set"),
    option: OptionNameSchema,
    value: OptionValueSchema,
  }),
  z.object({ kind: z.literal("reset") }),
]);
export type PicksChange = z.infer<typeof PicksChangeSchema>;

/** `picks` with `change` applied — the one fold, shared by the store and the optimistic overlay. */
export function applyPicksChange(
  picks: StoredPicks,
  change: PicksChange,
): StoredPicks {
  return change.kind === "reset"
    ? {}
    : { ...picks, [change.option]: change.value };
}

/**
 * One prototype's stored picks (push, keyed by `name` — a point resource, one
 * small record per subscription). Notified by the writer the moment it writes,
 * and by the watcher on every other backend (the store is host-global). `{}`
 * is "nothing picked", a legitimate answer; a name that is not a prototype
 * throws.
 */
export const prototypePicksResource = resourceDescriptor<
  StoredPicks,
  { name: string }
>("prototypes.picks", StoredPicksSchema, {});

/**
 * Apply one change to a prototype's picks. 404 for an unknown prototype. An
 * automated browser session's change is recorded in the agent-write ledger and
 * put back at the end of its run, so an E2E that clicks the picker never leaves
 * the user looking at another variant.
 */
export const setPrototypePicks = defineEndpoint({
  route: "PUT /api/prototypes/:name/picks",
  body: PicksChangeSchema,
});
