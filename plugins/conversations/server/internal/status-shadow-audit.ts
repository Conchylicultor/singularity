import { recordReport } from "@plugins/reports/server";
import { isTransientDbError } from "@plugins/database/server";
import { defineTimer } from "@plugins/infra/plugins/background/plugins/timer/server";
import { isMain } from "@plugins/infra/plugins/runtime-identity/core";
import { listConversationsForInfra } from "@plugins/tasks/plugins/tasks-core/server";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { planConversationUpdate, type UpdatePlan } from "./plan-update";
import { readQuestionHolds } from "./question-hold";
import { auditStep, OPEN_MISS_MS, type Divergence } from "./shadow-audit-step";
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
// — the same `planConversationUpdate` the reconciler applies — and follows each
// conversation whose verdict differs from its DB row until it stops differing
// (`auditStep`). A difference a signal-driven reconcile fixed is LATE: logged
// with its latency, never reported. One only the sweep fixed, or that nothing
// fixed within OPEN_MISS_MS, is a MISSED signal: ONE report naming the
// conversation and what differed. Delete this file, shadow-audit-step.ts and
// the timer allowlist entry once those reports stay empty
// (research/2026-10-07-conversations-status-shadow-audit-retirement.md).
//
// Main only: main holds the user's conversations, and one 1 s `list()` (one
// `ps`, one `list-panes`, one capture per pane) on one backend is its cost.

const TICK_MS = 1000;
// lastSignalReconcileAt entries older than this are dropped each tick. Longer
// than OPEN_MISS_MS, so an open divergence's fixing signal is never pruned away.
const SIGNAL_EVIDENCE_MS = 2 * OPEN_MISS_MS;

// conversation id → the divergence being followed. Bounded by the active
// conversations: an entry is dropped the tick it stops diverging.
const divergences = new Map<string, Divergence>();
// The row as it stood when each divergence began — the report's evidence (by
// the time a divergence resolves, the row has already been fixed).
const rowAtStart = new Map<
  string,
  { status: string | null; waitingFor: string | null }
>();

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

  const diverging = new Map<string, string>();
  for (const { id, row, plan } of verdicts) {
    const signature = auditSignature(plan);
    if (signature === null) continue;
    diverging.set(id, signature);
    if (!divergences.has(id)) {
      rowAtStart.set(id, {
        status: row?.status ?? null,
        waitingFor: row?.waitingFor ?? null,
      });
    }
  }
  const findings = auditStep(
    divergences,
    diverging,
    (id) => lastSignalReconcileAt.get(id),
    now,
  );
  for (const finding of findings) {
    const { id, signature, divergedForMs } = finding;
    if (finding.kind === "late") {
      console.warn(
        `[conversations.status-shadow-audit] ${id}: "${signature}" fixed by a signal after ${divergedForMs}ms (late, not missed)`,
      );
      continue;
    }
    const row = rowAtStart.get(id);
    console.warn(
      `[conversations.status-shadow-audit] ${id}: "${signature}" for ${divergedForMs}ms, ${finding.resolvedBy === "open" ? "still unfixed" : "fixed only by the sweep"}`,
    );
    void recordReport({
      kind: "crash",
      source: "server-caught",
      message: `Status signal missed for ${id}: the shadow poller wanted "${signature}" for ${Math.round(divergedForMs / 1000)}s and no push signal delivered it`,
      data: {
        errorType: "StatusSignalMissed",
        label: "conversations.status-shadow-audit",
        conversationId: id,
        verdict: signature,
        resolvedBy: finding.resolvedBy,
        divergedForMs,
        rowStatus: row?.status ?? null,
        rowWaitingFor: row?.waitingFor ?? null,
      },
    });
  }
  for (const id of rowAtStart.keys()) {
    if (!divergences.has(id)) rowAtStart.delete(id);
  }
  for (const [id, at] of lastSignalReconcileAt) {
    if (now - at > SIGNAL_EVIDENCE_MS) lastSignalReconcileAt.delete(id);
  }
}

export const statusShadowAuditTimer = defineTimer({
  name: "conversations.status-shadow-audit",
  description:
    "Temporary: every second, computes what the retired status poller would have written and reports any conversation whose status no push signal corrected — fixed only by the minute sweep, or not at all — the audit that decides whether it can be deleted.",
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
