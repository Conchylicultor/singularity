import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The gateway's log directory: its own rotating slog sink (`gateway.log`), the
 * per-worktree channel logs it writes, and the raw stdout/stderr capture the
 * launcher opens for the daemon (`gateway-stdio.log`).
 *
 * It sits DIRECTLY at `logs/` today and moves down one level to `logs/gateway/`
 * in the layout migration, which is why it is declared as its own entry rather
 * than left to the bare `logs` kind: the kind is a reclaim class, not an owner,
 * and these files have one.
 */
export const gatewayLogs = defineDataDir({
  kind: "logs",
  name: "gateway",
  owner: "infra/launcher",
  description:
    "Gateway daemon logs: its rotating slog sink, per-worktree channel logs, and the raw stdio capture",
  // Observability output. Losing it costs the record of a past boot, never
  // anything the running system needs.
  reclaim: { kind: "safe" },
  legacyLocation: {
    path: "logs",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [gatewayLogs];
