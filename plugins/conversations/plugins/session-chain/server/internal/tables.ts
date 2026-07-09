import { index, uniqueIndex } from "drizzle-orm/pg-core";
import { defineEntity, defaultNow } from "@plugins/infra/plugins/entities/server";
import { type FieldsRecord } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";

// One row per distinct Claude session id a conversation has ever run under, in
// first-seen order. A conversation's transcript is spread over SEVERAL session
// files (Claude Code relocates a live session on fork / daemon handoff), and
// none of Claude's own artifacts records that ordering — so the poller records
// it here as it observes each id change.
//
// The field record is local (not `core/`): nothing crosses the runtime boundary,
// so there is no wire schema to keep in sync. `id` is an app-minted text PK (no
// DB default); `seenAt` defaults to now() in the DB.
const conversationSessionFields = {
  id:              textField(),
  conversationId:  textField(),
  claudeSessionId: textField(),
  seenAt:          dateField(),
} satisfies FieldsRecord;

// Append-only chain rows — one per observed session id, never updated, never
// deleted. Soft FK to conversations (text id, no cascade): the chain has its own
// lifecycle and outlives the conversation row, so a deleted conversation's
// transcript files can still be located (swept later if needed) — the same
// contract as the append-only `conversation_summaries` precedent.
//
// Two indexes, each load-bearing:
//   • (conversationId, seenAt) serves BOTH reads — the tail probe
//     (ORDER BY seen_at DESC LIMIT 1) and the oldest→newest chain listing.
//   • UNIQUE (conversationId, claudeSessionId) is the CONSTRAINT that makes the
//     concurrent-append race structurally impossible: `recordSessionId` inserts
//     with ON CONFLICT DO NOTHING, so two poller ticks observing the same new id
//     can never both land a row. It also encodes the domain invariant — a session
//     id appears exactly once in a chain, pinned at its first-seen position, so a
//     session that flaps away and back (A→B→A) does not re-append A and make a
//     consumer read the same transcript file twice.
const conversationSessions = defineEntity(
  "conversation_sessions",
  conversationSessionFields,
  {
    primaryKey: "id",
    columns: {
      seenAt: { default: defaultNow() },
    },
    indexes: (t) => [
      index("conversation_sessions_by_conv_idx").on(t.conversationId, t.seenAt),
      uniqueIndex("conversation_sessions_conv_session_idx").on(
        t.conversationId,
        t.claudeSessionId,
      ),
    ],
  },
);

// drizzle-kit schema-glob discovery.
export const _conversationSessions = conversationSessions.table;
