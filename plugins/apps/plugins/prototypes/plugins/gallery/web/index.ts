import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { prototypesGalleryPane, prototypeDetailPane } from "./panes";
import { PrototypeStages } from "./slots";
import { StageSwitcher, ImproveButton } from "./components/detail-actions";
import { FocusStage } from "./components/focus-stage";

export { prototypesGalleryPane, prototypeDetailPane } from "./panes";
export { ScaledIframe } from "./components/scaled-iframe";
export {
  usePrototypeDetail,
  usePrototypePicks,
  usePrototypeSrc,
} from "./context";
export type { PrototypeDetailContextValue, PrototypeStage } from "./context";
export { PrototypeStages } from "./slots";
export type { PrototypeStageContribution, PrototypeStageProps } from "./slots";

export default {
  description:
    "Prototypes gallery list pane and the detail pane whose stage set is a slot (Focus is its own contribution; Compare is a sibling plugin's), with an Improve this prototype affordance and the hover picker for a prototype's declared options (drawn by the app over the stage, never inside the page).",
  contributions: [
    Pane.Register({ pane: prototypesGalleryPane }),
    Pane.Register({ pane: prototypeDetailPane }),
    // The detail pane's header IS its action bar: every control in it is a
    // contribution, so sibling plugins (e.g. Present) extend it without
    // touching this plugin. The `view-mode` id is pinned by the authored
    // header order in `config/apps/prototypes/gallery/`.
    prototypeDetailPane.Actions({
      id: "view-mode",
      component: StageSwitcher,
    }),
    prototypeDetailPane.Actions({ id: "improve", component: ImproveButton }),
    // The pane's own stage, contributed the same way a sibling plugin
    // contributes another (the `compare` plugin's Compare stage).
    PrototypeStages.Stage({
      id: "focus",
      label: "Focus",
      order: 10,
      component: FocusStage,
    }),
  ],
  slots: {
    "prototypes-gallery": prototypesGalleryPane,
    "prototypes-detail": prototypeDetailPane,
    stage: PrototypeStages.Stage,
  },
} satisfies PluginDefinition;
