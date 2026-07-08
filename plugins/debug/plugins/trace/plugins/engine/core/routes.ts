import { defineRoute } from "@plugins/primitives/plugins/pane/core";

// Routes live in core so a server renderTask and other plugins' web KindViews
// can build the exact same deep link a pane resolves to — the reports/core
// routes precedent. The pane itself lands in Phase 4; the routes are declared
// now so linkage (report → trace) can be wired without a web dependency.
export const traceListRoute = defineRoute({ id: "traces", segment: "traces" });

export const traceDetailRoute = defineRoute({
  // `x/:id` (a static prefix, per the pane segment rule) under the list route.
  id: "trace-detail",
  segment: "x/:id",
  parent: traceListRoute,
});
