import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import {
  worktreeRemovalSink,
  type WorktreeRemovalEvent,
} from "@plugins/infra/plugins/worktree/server";

/**
 * The worktree-checkout removal audit channel.
 *
 * WHY IT EXISTS. Twenty-two worktree checkouts were deleted out from under live
 * conversations and nothing in the system recorded it. `removeWorktree` wrote no
 * log, and the reaper's only per-target line is written from its `catch` — so a
 * SUCCESSFUL removal was invisible by construction. Answering "what deleted
 * this?" meant correlating gateway unregistration timestamps against Postgres
 * database-directory ctimes, and still never named an actor.
 *
 * Two complementary line kinds, and only together do they prove anything:
 *   - `in-app`      — every removal this backend performs, with its caller.
 *   - `disappeared` — every checkout observed to vanish, ours or not.
 *
 * The `in-app` half is cheap and its real value is NEGATIVE evidence: once every
 * removal we perform is recorded, a `disappeared` line with no matching `in-app`
 * line *proves* an external actor instead of leaving it to be inferred.
 *
 * The channel is declared HERE, not in `infra/worktree`. That is the dependency
 * inversion the durable-signals accounting states — a CRUD primitive must not
 * name the observability stack — and it also keeps `infra/worktree`'s import
 * closure small, which matters because build-time tooling reaches it: declaring
 * a durable channel there would drag `log-channels` → `endpoints` into every
 * script that touches a worktree.
 *
 * Nothing fails if that inversion is undone. It used to: `infra/worktree` was
 * also compiled by a `tools` tsconfig whose `lib` withheld DOM, and the
 * `endpoints` chain reaches DOM types. The repo builds one full-lib program now
 * (research/2026-09-18-global-type-check-one-program.md), so this is design
 * intent. If it needs enforcing, the rung is a `plugin-boundaries` deny rule,
 * not a second tsconfig.
 */
const log = defineLogSink({
  id: "worktree-removal",
  description:
    "Worktree checkout removal audit: every in-app removeWorktree call (path, id, pid, caller, branch, outcome), every failed in-app checkout, and every observed disappearance of a checkout, flagged in-app or external.",
});

// Publishing is observability on a path that must not fail because of it: a
// broken sink must never take down the removal it is describing. The error still
// reaches the console, so a broken sink is loud rather than silent.
function publish(line: Record<string, unknown>): void {
  try {
    log.publish(JSON.stringify({ ...line, at: Date.now() }));
    // eslint-disable-next-line promise-safety/no-bare-catch -- every failure mode here (sink IO, serialization) maps to the same handling, and this is the audit path: it must not propagate into the removal or the watcher sweep it is describing
  } catch (err) {
    console.error("[worktree-removal] publish failed", err);
  }
}

/** Publish an observed disappearance (written by the watcher). */
export function publishDisappearance(line: Record<string, unknown>): void {
  publish({ kind: "disappeared", ...line });
}

/**
 * Route in-app removal announcements from `infra/worktree`'s seam onto this
 * channel. Registered in `onReady`; until then the seam is a no-op, which is
 * correct — a removal before this plugin is ready has no audit consumer.
 */
export function registerRemovalChannel(): void {
  worktreeRemovalSink.register((event: WorktreeRemovalEvent) => {
    publish({ kind: "in-app", ...event });
  });
}

export function unregisterRemovalChannel(): void {
  worktreeRemovalSink.register(null);
}
