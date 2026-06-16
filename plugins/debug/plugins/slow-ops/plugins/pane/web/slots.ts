import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";

// The Slow Ops pane is a slot-backed 2-tab host: the pane defines the tabbed
// view and contributes the **Local** tab (the live per-worktree table); the
// `cluster` sub-plugin contributes the **Cluster** tab into the same slot. This
// follows the collection-consumer rule — the pane never imports the cluster
// component, it just owns the slot every tab registers into, so adding a third
// view later is a registration with zero pane edits.
const tabbedView = defineTabbedView<Record<string, never>>("debug.slow-ops");

export const SlowOps = {
  View: tabbedView.View,
  Host: tabbedView.Host,
};
