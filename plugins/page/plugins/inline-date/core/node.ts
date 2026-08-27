import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { dateToken, reminderToken } from "./tokens";

/**
 * The inline date-mention token family's ONE declaration. Two token kinds share
 * one node: `[[date:<iso>]]` and `[[reminder:<id>:<iso>]]`, discriminated by
 * whether `reminderId` is set — which is exactly what minting/clearing the id
 * does, since the server reconciles reminders from the block's text.
 *
 * `reminderId` is genuinely `null` for a plain date mention, and that `null` has
 * to survive the Yjs property sync (a `Y.XmlElement` attribute holds any JSON
 * value, so it does). Pinned by `web/internal/collab-roundtrip.test.ts`.
 *
 * A `type` alias, never an `interface` — see `PageLinkFields` for why.
 */
export type DateMentionFields = { iso: string; reminderId: string | null };

/**
 * `textContent: "empty"` keeps the token out of live root-text reads (the slash
 * menu and the `@` / `[[` query scans).
 */
export const dateMentionNode = defineInlineTokenNode<DateMentionFields>({
  type: "date-mention",
  fields: ["iso", "reminderId"],
  token: ({ iso, reminderId }) =>
    reminderId !== null ? reminderToken(reminderId, iso) : dateToken(iso),
  // Group 1 = `[[date:<iso>]]`; groups 2,3 = `[[reminder:<id>:<iso>]]`.
  // Exactly one alternative of `MENTION_TOKEN_PATTERN` (`./tokens`) matches per
  // token.
  fieldsOf: (match) =>
    match[1]
      ? { iso: match[1], reminderId: null }
      : { iso: match[3]!, reminderId: match[2]! },
  textContent: "empty",
});
