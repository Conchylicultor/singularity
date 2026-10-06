import { recordReport } from "@plugins/reports/server";
import { isTransientDbError } from "@plugins/database/server";
import { defineTimer } from "@plugins/infra/plugins/background/plugins/timer/server";
import { isMain } from "@plugins/infra/plugins/runtime-identity/core";
import { listConversationsForInfra } from "@plugins/tasks/plugins/tasks-core/server";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { planConversationUpdate, type UpdatePlan } from "./plan-update";
import { readQuestionHolds } from "./question-hold";
import {
  collectLive,
  lastSignalReconcileAt,
  orphansOf,
  planFor,
} from "./status-reconciler";

// TEMPORARY. The retired 1 s `conversations.poller`, kept running in SHADOW
// mode while the push signals that replaced it prove themselves
// (research/2026-10-02-conversations-poller-push-status.md, Verification 4).
//
// It writes nothing. Each tick it computes what the poller would have written
// — the same `planConversationUpdate` the reconciler applies — and when that
// verdict has differed from the DB row for longer than SHADOW_MISS_MS, it files
// ONE report naming the conversation and what differs: a state change that no
// push signal delivered. Delete this file (and its timer allowlist entry) once
// those reports are empty or each one is explained.
//
// Main only: main holds the user's conversations, and one 1 s `list()` (one
// `ps`, one `list-panes`, one capture per pane) on one backend is its cost.

const TICK_MS = 1000;
const SHADOW_MISS_MS = 2_000;
// lastSignalReconcileAt entries older than this are dropped each tick.
const SIGNAL_EVIDENCE_MS = 60_000;

interface Divergence {
  signature: string;
  since: number;
  reported: boolean;
}

// conversation id → the verdict it has diverged on since `since`. Bounded by
// the active conversations: an entry is dropped the tick it stops diverging.
const divergences = new Map<string, Divergence>();

/**
 * What a plan would change, as a stable string — or null for a plan the audit
 * does not count: no write, a title-only patch (a pane title has no signal by
 * design), or a "starting" row swept to gone (the sweep's job by design).
 */
function auditSignature(plan: UpdatePlan): string | null {
  switch (plan.kind) {
    case "noop":
      return null;
    case "gone":
      return plan.stuckStartingMs !== null ? null : "gone";
    case "patch": {
      const counted = Object.entries(plan.patch).filter(
        ([field]) => field !== "title",
      );
      return counted.length > 0
        ? `patch ${JSON.stringify(Object.fromEntries(counted))}`
        : null;
    }
    case "adopt":
    case "closed":
    case "hibernate":
      return plan.kind;
  }
}

async function shadowAuditTick(): Promise<void> {
  const [live, rows] = await Promise.all([
    // Unreported: a failing runtime is the reconciler's to report, not ours
    // once a second.
    collectLive(undefined, { report: false }),
    listConversationsForInfra(),
  ]);
  const now = Date.now();
  const verdicts: Array<{
    id: string;
    row: Conversation | null;
    plan: UpdatePlan;
  }> = [];
  // A pure read: the audit never reaps (it writes nothing).
  const holds = await readQuestionHolds(rows.map((r) => r.id));
  for (const row of rows) {
    const { plan } = await planFor(row, live, holds);
    verdicts.push({ id: row.id, row, plan });
  }
  for (const id of await orphansOf(live, new Set(rows.map((r) => r.id)))) {
    verdicts.push({
      id,
      row: null,
      plan: planConversationUpdate(
        null,
        { kind: "live", info: live.next.get(id)! },
        { onMain: true, now, sessionAccepted: false, questionHold: null },
      ),
    });
  }

  const diverging = new Set<string>();
  for (const { id, row, plan } of verdicts) {
    const signature = auditSignature(plan);
    if (signature === null) continue;
    diverging.add(id);
    const prev = divergences.get(id);
    if (!prev || prev.signature !== signature) {
      divergences.set(id, { signature, since: now, reported: false });
      continue;
    }
    if (prev.reported || now - prev.since < SHADOW_MISS_MS) continue;
    prev.reported = true;
    const lastSignal = lastSignalReconcileAt.get(id);
    console.warn(
      `[conversations.status-shadow-audit] ${id}: "${signature}" for ${now - prev.since}ms with no signal-driven fix`,
    );
    void recordReport({
      kind: "crash",
      source: "server-caught",
      message: `Status signal missed for ${id}: the shadow poller has wanted "${signature}" for over ${SHADOW_MISS_MS / 1000}s`,
      data: {
        errorType: "StatusSignalMissed",
        label: "conversations.status-shadow-audit",
        conversationId: id,
        verdict: signature,
        rowStatus: row?.status ?? null,
        rowWaitingFor: row?.waitingFor ?? null,
        lastSignalReconcileAgoMs:
          lastSignal === undefined ? null : now - lastSignal,
      },
    });
  }
  for (const id of divergences.keys()) {
    if (!diverging.has(id)) divergences.delete(id);
  }
  for (const [id, at] of lastSignalReconcileAt) {
    if (now - at > SIGNAL_EVIDENCE_MS) lastSignalReconcileAt.delete(id);
  }
}

export const statusShadowAuditTimer = defineTimer({
  name: "conversations.status-shadow-audit",
  description:
    "Temporary: every second, computes what the retired status poller would have written and reports any conversation whose status no push signal corrected within 2 seconds — the audit that decides whether the poller can be deleted.",
  everyMs: TICK_MS,
  mainOnly: true,
  run: () =>
    shadowAuditTick().catch((err: unknown) => {
      // Transient = central is restarting / catching up; the next tick audits
      // again. Anything else is loud.
      if (isTransientDbError(err)) return;
      throw err;
    }),
});

export function startStatusShadowAudit(): void {
  if (isMain()) statusShadowAuditTimer.start();
}
