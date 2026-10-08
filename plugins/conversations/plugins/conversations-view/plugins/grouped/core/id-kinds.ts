import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A conversation group's id (`conversation_groups.id`), declared once
 * (`plugins/ids`). Nothing mints one today — the Grouped tab that created
 * groups is gone — but the table and its `cgrp-…` rows stay, so the kind keeps
 * them recognised and is the one mint should groups come back.
 */
export const conversationGroupIdKind = defineIdKind({
  prefix: "cgrp",
  label: "Conversation group",
});

export type ConversationGroupId = IdOf<typeof conversationGroupIdKind>;
