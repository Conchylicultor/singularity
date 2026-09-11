import { z } from "zod";
import {
  defineJob,
  NonRetryableError,
} from "@plugins/infra/plugins/jobs/server";
import {
  readJsonlEventsFromChain,
  resolveConversationTranscriptPaths,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import { checkpointPrototype } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import { planTurnCheckpoint } from "./turn";

// Triggered on every `conversationTurnCompleted`. Records a `turn` version of
// each prototype this turn's tool calls named. Attribution comes from the
// transcript, never from "whatever is dirty", so an agent finishing its turn
// cannot snapshot another agent's half-written prototype.
//
// No dedup of its own: the event is at-least-once and several backends may emit
// it for one turn, but `checkpointPrototype` is idempotent per `messageId` — a
// version already carrying this turn's message answers `unchanged`.
export const checkpointTurnJob = defineJob({
  name: "prototypes.checkpoint-turn",
  // minutes: each checkpoint spawns git against the prototype's history repo,
  // and `checkpointPrototype` takes no signal or timeout of its own — so nothing
  // shorter than the work bounds it ("does it spawn?"). The transcript read is
  // one local file chain.
  hold: "minutes",
  input: z.object({}).passthrough(),
  event: z
    .object({
      conversationId: z.string(),
      text: z.string(),
      messageId: z.string().nullable(),
    })
    .passthrough(),
  dedup: "none",
  // A prototype's history lock held by another backend recording the same turn
  // throws; a retry a few seconds later finds the version there (`unchanged`) or
  // takes the lock. Graphile's backoff over four attempts spans about a minute,
  // far past one git commit.
  maxAttempts: 4,
  run: async ({ event }) => {
    if (!event) {
      throw new NonRetryableError(
        "prototypes.checkpoint-turn runs only from conversationTurnCompleted; it was enqueued directly",
      );
    }
    const { conversationId } = event;

    const events = await readJsonlEventsFromChain(
      await resolveConversationTranscriptPaths(conversationId),
    );
    const plan = planTurnCheckpoint(events, event);
    if (plan.kind === "nothing") return;

    // Every id is attempted before any failure is thrown, so one busy lock does
    // not hold back the other prototypes; the retry re-records the ones that
    // already landed as `unchanged`. `recorded`, `unchanged` and
    // `no-such-prototype` are all ordinary answers.
    const results = await Promise.allSettled(
      plan.ids.map((id) =>
        checkpointPrototype(id, {
          kind: "turn",
          subject: plan.subject,
          body: plan.body,
          conversationId,
          messageId: plan.messageId,
        }),
      ),
    );
    const failed = plan.ids.filter((_, i) => results[i]?.status === "rejected");
    if (failed.length > 0) {
      throw new AggregateError(
        results.flatMap((r) => (r.status === "rejected" ? [r.reason] : [])),
        `checkpoint of ${failed.join(", ")} failed for conversation ${conversationId}`,
      );
    }
  },
});
