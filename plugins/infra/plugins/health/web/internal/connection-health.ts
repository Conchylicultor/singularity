import type { WsStatus } from "@plugins/primitives/plugins/networking/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";

/** The two sockets the app lives on, in the order a summary names them. */
const CHANNELS = [
  { key: "worktree", name: "server" },
  { key: "central", name: "central" },
] as const;

type Channel = (typeof CHANNELS)[number]["key"];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "server", "central", or "server and central". */
function joinNames(names: readonly string[]): string {
  return names.join(" and ");
}

/**
 * The connection row's health, from the two notification sockets' states.
 *
 * - both open → ok.
 * - any closed → critical, naming which ("Server disconnected").
 * - otherwise any still (re)connecting → attention, `transitioning` so the dot
 *   pulses while the socket is on its way back.
 *
 * Closed outranks reconnecting: a socket that gave up is worse than one that is
 * still trying, whatever the other socket is doing.
 */
export function connectionHealth(
  statuses: Readonly<Record<Channel, WsStatus>>,
): HealthStatus {
  const closed = CHANNELS.filter((c) => statuses[c.key] === "closed");
  if (closed.length > 0) {
    return {
      state: "critical",
      summary: `${capitalize(joinNames(closed.map((c) => c.name)))} disconnected`,
    };
  }

  const pending = CHANNELS.flatMap((c) => {
    const status = statuses[c.key];
    return status === "connecting" || status === "reconnecting"
      ? [{ verb: status, name: c.name }]
      : [];
  });
  if (pending.length > 0) {
    const sameVerb = pending.every((p) => p.verb === pending[0]!.verb);
    const phrase = sameVerb
      ? `${pending[0]!.verb} to ${joinNames(pending.map((p) => p.name))}`
      : pending.map((p) => `${p.verb} to ${p.name}`).join(", ");
    return {
      state: "attention",
      summary: `${capitalize(phrase)}…`,
      transitioning: true,
    };
  }

  return { state: "ok", summary: "Server and central connected" };
}
