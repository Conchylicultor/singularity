import { useLive } from "@plugins/network/plugins/live/web";
import { appUsageSummary } from "../../core";

/**
 * The live per-app usage summary (7-day and all-time opens and active time,
 * last opened). A `ResourceResult`: while it loads there is no stand-in — an
 * app absent from a READY summary has simply never been used.
 */
export function useAppUsageSummary() {
  return useLive(appUsageSummary);
}
