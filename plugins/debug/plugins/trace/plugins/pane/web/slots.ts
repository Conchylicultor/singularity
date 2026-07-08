import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";

// The Slow Events pane is a slot-backed tab host: this plugin owns the slot and
// contributes the **Events** tab (the durable trace list); the merged Slow Ops
// surfaces contribute the **Aggregates** (slow-ops/pane) and **Cluster**
// (slow-ops/cluster) tabs into the SAME slot. Per the collection-consumer rule
// the pane never imports those components — it just owns the slot every tab
// registers into, so all slowness lives under one sidebar entry.
const tabbedView = defineTabbedView<Record<string, never>>("debug.slow-events");

export const SlowEvents = {
  View: tabbedView.View,
  Host: tabbedView.Host,
};
