import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import type { ForeignSessionPayload } from "@plugins/conversations/plugins/transcript-watcher/core";
import { sessionDivergenceConfig } from "../../core";
import { detectDivergences } from "./detect";
import {
  detectDirectoryMismatches,
  detectSharedSessionIds,
} from "./detect-commission";

// Cheap scheduled session-divergence monitor. Runs every 5 min in EACH
// worktree's own DB fork (perWorktree) because the session chain it audits lives
// in that fork's `conversation_sessions` table — the same reason queue-health
// samples its own queue. `dedup: "singleton"` means the monitor can never pile
// up, and `maxAttempts: 3` keeps a transiently-broken monitor (a `ps` that fails,
// a transcript stat that races a delete) from becoming a dead-job storm of its
// own. Silent when healthy: it files only when a predicate trips.
//
// Three predicates, two report kinds, one tick:
//   • ./detect — OMISSION. A session the agent is talking in that the chain
//     never recorded, i.e. turns the UI can never render. Files
//     `conversation-session-divergence`.
//   • ./detect-commission — the two COMMISSION detectors. An id the chain DID
//     record that belongs to another conversation, found either by its
//     transcript's directory or by two chains holding it. Both file
//     `conversation-foreign-session` (owned by transcript-watcher — the read
//     path files the same kind when it refuses to merge the foreign file), so
//     the two discovery routes collapse onto one deduped task per corrupt row.
//
// Nothing is caught here: a detector that throws must fail the job loudly rather
// than let the tick report a partial picture as if it were the whole one.
export const sessionDivergenceMonitorJob = defineJob({
  name: "debug.session-divergence-monitor",
  // seconds: the detector captures the process table and the tmux pane list
  // through subprocesses it does not time out, then stats a transcript per
  // reachable session. Its measured 25.6s mean is 21.4s of background-acquire
  // WAIT over ~4.2s of work — the class is read off the work.
  hold: "seconds",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/5 * * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cfg = getConfig(sessionDivergenceConfig);
    if (!cfg.enabled) return;

    const divergences = await detectDivergences(cfg.graceMinutes * 60_000);
    for (const d of divergences) {
      await recordReport({
        kind: "conversation-session-divergence",
        source: "server-session-monitor",
        data: {
          conversationId: d.conversationId,
          chainTailSessionId: d.chainTailSessionId,
          liveSessionId: d.liveSessionId,
          tailMtimeMs: d.tailMtimeMs,
          liveMtimeMs: d.liveMtimeMs,
        },
        message:
          `${d.conversationId} is talking in ${d.liveSessionId}, ` +
          `not the chain tail ${d.chainTailSessionId}`,
      });
    }

    for (const foreign of [
      ...(await detectDirectoryMismatches()),
      ...(await detectSharedSessionIds()),
    ]) {
      await reportForeignSession(foreign);
    }
  },
});

/**
 * File one `conversation-foreign-session` row. Deduped by the kind's own
 * fingerprint (`conversation` + `session`), so a chain that stays corrupt
 * raises its `count` every 5 minutes instead of piling up tasks — and the two
 * detectors landing on the same row merge into it rather than double-filing.
 */
async function reportForeignSession(
  payload: ForeignSessionPayload,
): Promise<void> {
  const how =
    payload.reason === "directory-mismatch"
      ? `its transcript lives in ${payload.foreignDir}, not ${payload.anchorDir}`
      : `it is also in the chain of ${payload.otherConversationIds.join(", ")}`;
  await recordReport({
    kind: "conversation-foreign-session",
    source: "server-session-monitor",
    data: { ...payload },
    message:
      `${payload.conversationId} has a foreign session ` +
      `${payload.foreignSessionId} in its chain — ${how}`,
  });
}
