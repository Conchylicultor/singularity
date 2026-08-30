import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { configV2ValuesSchema } from "./resource";

// One-shot snapshot fetched at boot to hydrate the client cache before first
// paint, so config reads never flash defaults and never suspend.
//
// `global` is every descriptor's resolved GLOBAL (no-scope) config, keyed by
// storePath. `scopes` is every USER-LAYER scope with its own config (a committed
// git scope, a runtime fork, OR a plain scoped write) — the same predicate the
// live `configV2ScopesResource` uses, so a warm reload of any app with its own
// theme paints scoped on the first frame. The config_v2 boot task hydrates both.
export const configSnapshot = defineEndpoint({
  route: "GET /api/config-v2/snapshot",
  response: z.object({
    global: z.record(configV2ValuesSchema),
    scopes: z.array(
      z.object({
        scopeId: z.string(),
        path: z.string(),
        values: configV2ValuesSchema,
      }),
    ),
  }),
});

export const setConfigField = defineEndpoint({
  route: "POST /api/config-v2/set-field",
  body: z.object({
    storePath: z.string(),
    key: z.string(),
    value: z.unknown(),
    scopeId: z.string().optional(),
  }),
});

export const forkScope = defineEndpoint({
  route: "POST /api/config-v2/fork-scope",
  body: z.object({ scopeId: z.string() }),
});

export const deleteScope = defineEndpoint({
  route: "POST /api/config-v2/delete-scope",
  body: z.object({ scopeId: z.string() }),
});

// Per-descriptor scope primitives (single descriptor × scope), distinct from
// fork-scope/delete-scope which act over the whole `scope: "app"` set. Used by
// the settings detail pane to add / stop a per-app customization for one
// descriptor.
export const forkDescriptorScope = defineEndpoint({
  route: "POST /api/config-v2/fork-descriptor-scope",
  body: z.object({ storePath: z.string(), scopeId: z.string() }),
});

export const removeDescriptorScope = defineEndpoint({
  route: "POST /api/config-v2/remove-descriptor-scope",
  body: z.object({ storePath: z.string(), scopeId: z.string() }),
});

// ---------------------------------------------------------------------------
// Agent-write ledger
//
// Every config write carrying the agent-origin header has the document it
// overwrote snapshotted first, so the e2e harness can put it back. Without this
// an e2e that clicks "Group by Kind" to verify grouping leaves the user's
// surface grouped, and poisons its own next run's baseline.
// research/2026-08-30-global-agent-config-write-revert-ledger.md
// ---------------------------------------------------------------------------

const agentWriteDocSchema = z.object({
  storePath: z.string(),
  /** "" is the base scope. */
  scopeId: z.string(),
});

export const agentWriteEntrySchema = agentWriteDocSchema.extend({
  /** Which automated session, e.g. `e2e:runs-surface`. */
  source: z.string(),
  operations: z.array(z.string()),
  firstWriteAt: z.string(),
  lastWriteAt: z.string(),
});

/**
 * What is currently pending revert. `lastWriteAt` is the quiescence signal the
 * harness polls after closing the browser: a DataView's write-back is a 400ms
 * trailing debounce, so a request can still be in flight when the page dies.
 */
export const agentWriteLedger = defineEndpoint({
  route: "GET /api/config-v2/agent-writes",
  response: z.object({
    entries: z.array(agentWriteEntrySchema),
    lastWriteAt: z.string().nullable(),
  }),
});

/**
 * Restore every ledgered document and clear what was restored. No body —
 * revert-all is the whole contract, and it is what lets a run repair one it did
 * not launch. Idempotent: an empty ledger returns three empty arrays.
 *
 * The three arms are distinct outcomes, not degrees of failure. `diverged` is
 * a document someone else wrote after the agent did — deliberately left alone,
 * because restoring would destroy their edit.
 */
export const revertAgentWrites = defineEndpoint({
  route: "POST /api/config-v2/agent-writes/revert",
  response: z.object({
    reverted: z.array(agentWriteDocSchema.extend({ source: z.string() })),
    diverged: z.array(agentWriteDocSchema.extend({ detail: z.string() })),
    failed: z.array(agentWriteDocSchema.extend({ message: z.string() })),
  }),
});
