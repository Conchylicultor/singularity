import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { prototypesGalleryPane, prototypeDetailPane } from "./panes";
import { ViewModeSwitcher, ImproveButton } from "./components/detail-actions";

export { prototypesGalleryPane, prototypeDetailPane } from "./panes";
export { ScaledIframe } from "./components/scaled-iframe";
export { usePrototypeDetail } from "./context";
export type { PrototypeViewMode, PrototypeDetailContextValue } from "./context";

export default {
  description:
    "Prototypes gallery list pane and the Focus/Compare detail pane (scaled live iframes), with an Improve this prototype affordance.",
  contributions: [
    Pane.Register({ pane: prototypesGalleryPane }),
    Pane.Register({ pane: prototypeDetailPane }),
    // The detail pane's header IS its action bar: every control in it is a
    // contribution, so sibling plugins (e.g. Present) extend it without
    // touching this plugin.
    prototypeDetailPane.Actions({
      id: "view-mode",
      component: ViewModeSwitcher,
      position: "left",
    }),
    prototypeDetailPane.Actions({ id: "improve", component: ImproveButton }),
  ],
  slots: {
    "prototypes-gallery": prototypesGalleryPane,
    "prototypes-detail": prototypeDetailPane,
  },
} satisfies PluginDefinition;
