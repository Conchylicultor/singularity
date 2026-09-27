import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { SlowOpSchema } from "./schema";

// The Slow Ops pane's read: every `slow_ops` aggregate, ranked by total time.
// An endpoint, not a live value: `slow_ops` is ExcludeFromChangeFeed (a
// live-ticked high-churn counter amplifies the slowness it records), so a live
// read of it would never update — it would only claim a freshness it never
// gets. The pane reads it on open.
export const listSlowOps = defineEndpoint({
  route: "GET /api/slow-ops",
  response: z.array(SlowOpSchema),
});
