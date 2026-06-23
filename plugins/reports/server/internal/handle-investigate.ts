import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { investigateReport } from "./investigate";
import { investigateReport as investigateReportEndpoint } from "../../shared/endpoints";

// On-demand: turn a recorded report into an investigation task (idempotent —
// re-clicking returns the existing live task). The `:id` path param is the
// report id; investigateReport throws if no such report exists, which surfaces
// as a 500 (a wiring/race bug, not a benign client condition).
export const handleInvestigate = implement(
  investigateReportEndpoint,
  async ({ params }) => {
    if (!params.id) throw new HttpError(400, "id required");
    return investigateReport(params.id);
  },
);
