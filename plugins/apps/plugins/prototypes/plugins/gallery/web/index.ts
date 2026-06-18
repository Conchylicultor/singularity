import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { prototypesGalleryPane, prototypeDetailPane } from "./panes";

export { prototypesGalleryPane, prototypeDetailPane } from "./panes";

export default {
  description:
    "Prototypes gallery list pane and the Focus/Compare detail pane (scaled live iframes), with an Improve this prototype affordance.",
  contributions: [
    Pane.Register({ pane: prototypesGalleryPane }),
    Pane.Register({ pane: prototypeDetailPane }),
  ],
} satisfies PluginDefinition;
