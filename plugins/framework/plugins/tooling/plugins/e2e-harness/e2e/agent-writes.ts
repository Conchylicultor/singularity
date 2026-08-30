/**
 * Undoing the config an e2e run wrote.
 *
 * A DataView writes its per-view-instance sort / filter / groupBy straight back
 * through config_v2 into the user's durable config layer. So a script that
 * clicks "Group by Kind" to verify grouping works leaves the running surface
 * grouped for the user — and poisons its own next run's baseline, which is how
 * this was found: a "0 expanded elements" baseline became 44, the assertion saw
 * 44 → 44 and failed, and it looked exactly like a product bug.
 *
 * The server records the pre-write bytes of every config document a request
 * carrying the agent-origin header overwrites (`withBrowser` stamps that header
 * on every context, so every script and every ad-hoc `screenshot.ts --click`
 * drive is marked). This module is the harness half: ask for those documents
 * back, at both ends of every run.
 *
 * Design: `research/2026-08-30-global-agent-config-write-revert-ledger.md`.
 */
import { agentWriteLedger, revertAgentWrites } from "@plugins/config_v2/core";
import { agentFetch } from "./app-fetch";
import { waitFor } from "./wait";
import { pushDiagnostic } from "./diagnostics";

/**
 * Call an endpoint by its own definition rather than a retyped route string.
 *
 * Raw `fetch("/api/…")` is banned in `/web/` only, so `e2e` is free to do this
 * — but the route still comes from the contract, so a renamed endpoint is a
 * type error here instead of a 404 at run time.
 */
async function callEndpoint<T>(
  def: { method: string; path: string },
  phase: string,
): Promise<T> {
  const res = await agentFetch(def.path, { method: def.method });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[e2e] config ${phase} failed: ${def.method} ${def.path} → HTTP ${res.status} ${body}\n` +
        `  If this is a 404, the deployed server predates the agent-write ledger —\n` +
        `  run \`./singularity build\` to redeploy this worktree.`,
    );
  }
  return (await res.json()) as T;
}

interface LedgerStatus {
  entries: unknown[];
  lastWriteAt: string | null;
}

interface RevertOutcome {
  reverted: { storePath: string; scopeId: string; source: string }[];
  diverged: { storePath: string; scopeId: string; detail: string }[];
  failed: { storePath: string; scopeId: string; message: string }[];
}

/**
 * Wait for agent config writes to stop arriving.
 *
 * ONLY meaningful after the browser is closed, and that ordering is the whole
 * point. A DataView's write-back is a 400 ms trailing debounce living in a
 * `setTimeout` inside the page: closing the context destroys the timer, which
 * bounds what can still reach the server to requests already dispatched. This
 * then drains those, so the revert does not race a write that is still in
 * flight.
 *
 * The poll interval is comfortably wider than the debounce plus a localhost
 * round trip. A quiet ledger settles on the first read, so a run with no config
 * writes pays one request.
 */
export async function settleAgentConfigWrites(): Promise<void> {
  let previous: string | null | undefined;
  await waitFor(
    async () =>
      (await callEndpoint<LedgerStatus>(agentWriteLedger, "ledger read"))
        .lastWriteAt,
    (now) => {
      const quiet = previous !== undefined && now === previous;
      previous = now;
      return quiet;
    },
    { timeoutMs: 5_000, intervalMs: 750 },
  );
}

/**
 * Restore every config document this (or a previous) agent run overwrote.
 *
 * Throws on `failed`, which is what stops a run going green having left the
 * user's config changed. `diverged` is NOT a failure: it means someone edited
 * the document after the agent did, so the server deliberately left their edit
 * alone — the script did nothing wrong, and a diagnostic is the honest report.
 */
export async function repairAgentConfigWrites(
  phase: "start" | "end",
): Promise<void> {
  const out = await callEndpoint<RevertOutcome>(
    revertAgentWrites,
    `${phase} revert`,
  );

  if (out.failed.length > 0) {
    throw new Error(
      `[e2e] ${phase} config revert could not restore ${out.failed.length} document(s):\n` +
        out.failed
          .map(
            (f) =>
              `  ${f.storePath}${f.scopeId ? ` @${f.scopeId}` : ""} — ${f.message}`,
          )
          .join("\n"),
    );
  }

  for (const d of out.diverged) {
    pushDiagnostic(
      `config ${d.storePath} was edited after the agent wrote it — left as found (${d.detail})`,
    );
  }

  // Worth a line: at "start" it means a previous run died before its own
  // revert, which is exactly the case a teardown could never have covered.
  if (out.reverted.length > 0) {
    const what = out.reverted.map((r) => r.storePath).join(", ");
    console.log(
      phase === "start"
        ? `      repaired ${out.reverted.length} config document(s) left by a previous run: ${what}`
        : `      reverted ${out.reverted.length} config document(s) written by this run: ${what}`,
    );
  }
}
