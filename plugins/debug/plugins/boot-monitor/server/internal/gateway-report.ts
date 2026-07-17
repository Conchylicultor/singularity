import { implement } from "@plugins/infra/plugins/endpoints/server";
import type { BootGateway } from "@plugins/debug/plugins/trace/plugins/boot/core";
import { gatewayReport } from "../../shared/endpoints";

// Module-level box holding the gateway's boot report for THIS process. In-memory
// on purpose: the report describes the current boot only (process lifetime =
// boot epoch, the same reasoning as the monitor's `minted` flag), and the
// ordering holds by construction — the gateway POSTs ~100ms after the proxy
// swap, the monitor reads at the next minute tick. A wedged/older gateway never
// POSTs and the box stays null → the section's `gateway` is simply absent.
let report: BootGateway | null = null;

// Latest-wins: a gateway Restart re-POSTs for the same process; the newest
// report describes the readiness wait the user actually experienced.
export const handleGatewayReport = implement(gatewayReport, async ({ body }) => {
  report = body;
  return { ok: true };
});

/** The gateway's report for this boot, or null when none was POSTed. */
export function getGatewayBootReport(): BootGateway | null {
  return report;
}
