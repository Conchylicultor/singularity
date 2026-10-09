import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * One link of a conversation's session chain (`conversation_sessions.id`, the
 * ROW id), declared once (`plugins/ids`). A `uuid` kind: rows are appended by
 * the status reconciler, never named by a person.
 *
 * NOT the Claude session id the row records (`claudeSessionId`) — that one is
 * Claude Code's own, names transcript files on disk, and is never prefixed.
 * `legacyBareUuid`: the bare-uuid row ids were prefixed (`sess-<uuid>`) by a
 * data migration.
 */
export const sessionLinkIdKind = defineIdKind({
  prefix: "sess",
  label: "Session link",
  shape: "uuid",
  legacyBareUuid: true,
});

export type SessionLinkId = IdOf<typeof sessionLinkIdKind>;
