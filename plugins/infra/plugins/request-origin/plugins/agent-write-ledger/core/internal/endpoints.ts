import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// ---------------------------------------------------------------------------
// Agent-write ledger endpoints
//
// Every durable write carrying the agent-origin header has the files it
// overwrote snapshotted first, by whichever domain ledger owns them (config
// documents, prototype option picks, …), so the e2e harness can put them back.
// These two routes aggregate over EVERY registered ledger, so the harness names
// no domain and a new ledger is covered with zero harness changes.
//
// In `core` because the harness imports them, and `core` is the only barrel
// the `e2e` runtime may reach.
// research/2026-09-16-global-shared-prototype-option-picks.md (§ 4)
// ---------------------------------------------------------------------------

/** Which ledger a row belongs to, and which of its entries. */
const ledgerRowSchema = z.object({
  ledgerId: z.string(),
  /** Human, e.g. "Config documents" — what the harness prints. */
  label: z.string(),
  /** The owning domain's own identifier for the thing written. Opaque here. */
  key: z.string(),
});

export const agentWriteEntrySummarySchema = z.object({
  key: z.string(),
  /** Which automated session, e.g. `e2e:runs-surface`. */
  source: z.string(),
  /** Diagnostics only — `["set-field:views", "delete-override"]`. */
  operations: z.array(z.string()),
  firstWriteAt: z.string(),
  lastWriteAt: z.string(),
});
export type AgentWriteEntrySummary = z.infer<
  typeof agentWriteEntrySummarySchema
>;

export const agentWriteLedgerSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  entries: z.array(agentWriteEntrySummarySchema),
});
export type AgentWriteLedgerSummary = z.infer<
  typeof agentWriteLedgerSummarySchema
>;

export const agentWritesStatusSchema = z.object({
  ledgers: z.array(agentWriteLedgerSummarySchema),
  /** The newest `lastWriteAt` across every ledger; `null` when all are empty. */
  lastWriteAt: z.string().nullable(),
});
export type AgentWritesStatus = z.infer<typeof agentWritesStatusSchema>;

/**
 * What is currently pending revert, per ledger. `lastWriteAt` is the
 * quiescence signal the harness polls after closing the browser: a DataView's
 * write-back is a 400ms trailing debounce, so a request can still be in flight
 * when the page dies.
 */
export const agentWrites = defineEndpoint({
  route: "GET /api/agent-writes",
  response: agentWritesStatusSchema,
});

export const agentWritesRevertOutcomeSchema = z.object({
  reverted: z.array(ledgerRowSchema.extend({ source: z.string() })),
  diverged: z.array(ledgerRowSchema.extend({ detail: z.string() })),
  failed: z.array(ledgerRowSchema.extend({ message: z.string() })),
});
export type AgentWritesRevertOutcome = z.infer<
  typeof agentWritesRevertOutcomeSchema
>;

/**
 * Restore every entry of every ledger and clear what was restored. No body —
 * revert-all is the whole contract, and it is what lets a run repair one it did
 * not launch. Idempotent: empty ledgers return three empty arrays.
 *
 * The three arms are distinct outcomes, not degrees of failure. `diverged` is
 * an entry someone else wrote after the agent did — deliberately left alone,
 * because restoring would destroy their edit. `failed` stays in its ledger and
 * is retried by the next revert.
 */
export const revertAgentWrites = defineEndpoint({
  route: "POST /api/agent-writes/revert",
  response: agentWritesRevertOutcomeSchema,
});
