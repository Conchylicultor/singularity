import { defineRoute } from "@plugins/primitives/plugins/pane/core";

/**
 * The compositions surface's routes, in `core/` rather than beside the panes,
 * so a plugin in ANOTHER app can build a link to a composition without importing
 * this plugin's web barrel (and with it every section component and the closure
 * store). The `build` ← `debug` pair makes the same call for the same reason.
 *
 * `Pane.define({ route })` derives the pane's id / segment / defaultAncestors
 * from these, so a link and the pane it lands on cannot drift.
 */
export const compositionsRoute = defineRoute({
  id: "compositions",
  segment: "compositions",
});

/**
 * One composition's detail pane. The segment is `comp/:id`, not `c/:id` —
 * segments are globally unique after param names are erased, and `c/:convId`
 * belongs to conversations. A collision throws at runtime and fails the
 * `pane:segments-unique` check.
 *
 * `:id` is the compositions **config item id** (a uuid), not the composition
 * name — the name is what deploy keys on, so a cross-app link resolves the one
 * to the other through the manifest list.
 */
export const compositionDetailRoute = defineRoute({
  id: "composition-detail",
  segment: "comp/:id",
  parent: compositionsRoute,
});
