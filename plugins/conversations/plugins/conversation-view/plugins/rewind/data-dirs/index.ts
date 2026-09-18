import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/** How long a pre-rewind transcript is kept before the nightly sweep deletes it. */
export const REWIND_BACKUP_TTL_DAYS = 30;

/**
 * The full transcript of a conversation as it stood just before a "Rewind to
 * here", one file per rewind: `<conversationId>.<sessionId>.<epochMs>.jsonl`.
 *
 * A rewind MOVES the live session file here and writes the shortened one in its
 * place, so this is the only copy of the messages the rewind dropped. Host-global
 * rather than per-worktree: the transcripts themselves live in `~/.claude`,
 * outside any worktree. It must share a filesystem with `~/.claude` (the move is
 * a rename).
 */
export const rewindBackupsDir = defineDataDir({
  kind: "state",
  name: "conversation-rewinds",
  owner: "conversations/conversation-view/rewind",
  description:
    "Conversation transcripts as they stood just before a rewind (one file per rewind) — the only copy of the messages the rewind dropped",
  reclaim: { kind: "ttl", ttlDays: REWIND_BACKUP_TTL_DAYS },
});

export default [rewindBackupsDir];
