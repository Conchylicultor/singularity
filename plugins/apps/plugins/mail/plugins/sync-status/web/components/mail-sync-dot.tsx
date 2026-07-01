import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { useMailSyncState } from "../internal/use-mail-sync";

/**
 * Mail rail-icon attention dot. Reuses the same `useMailSyncState()` derivation
 * that drives the in-app sync banner, so the ambient dot can never drift from
 * the banner's classified phase. Stays silent (renders `null`) while pending or
 * for the calm phases (idle / syncing / healthy); paints a destructive dot for
 * a terminal error and a warning dot for a transient warning — the same
 * tone→severity mapping the banner uses.
 */
export function MailSyncDot() {
  const { pending, view } = useMailSyncState();
  if (pending || view == null) return null;
  if (view.phase !== "error" && view.phase !== "warning") return null;
  return (
    <StatusDot
      colorClass={view.phase === "error" ? "bg-destructive" : "bg-warning"}
    />
  );
}
