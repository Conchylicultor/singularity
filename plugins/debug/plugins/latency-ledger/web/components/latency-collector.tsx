import { useEffect } from "react";
import { updateDelayReportSink } from "@plugins/primitives/plugins/live-state/web";
import { recordInteraction, recordSample } from "../internal/client-ledger";
import { startInteractionTracking } from "../internal/interaction-tracker";

// A Core.Root side-effect component: mounted once per tab, renders nothing. It
// feeds the browser's three measurements into the client ledger — every page
// load, every in-app navigation, and the delay of every update a server change
// pushes into this tab.
export function LatencyCollector() {
  useEffect(() => startInteractionTracking(recordInteraction), []);

  useEffect(() => {
    updateDelayReportSink.register((info) => {
      recordSample("update-e2e", info.delayMs, { excluded: info.hidden });
    });
    return () => updateDelayReportSink.register(null);
  }, []);

  return null;
}
