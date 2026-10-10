import { serveCollection } from "@plugins/network/plugins/live/server";
import { outcomeReportRows } from "../../core";
import { taskOutcomeReports } from "./tables";

// Lookup-only, served from the extension handle: the loader reads only the
// subscribed task ids, and a submit reaches only that task's readers.
export const outcomeReportRowsServed = serveCollection(outcomeReportRows, {
  from: taskOutcomeReports,
});
