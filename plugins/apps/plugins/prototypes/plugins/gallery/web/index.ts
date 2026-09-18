import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { prototypesGalleryPane, prototypeDetailPane } from "./panes";
import {
  PrototypeCardActions,
  PrototypeDetailScope,
  PrototypeStages,
  PrototypeVersionActions,
} from "./slots";
import { DoneCardAction, DoneHeaderAction } from "./components/done-toggle";
import { StageSwitcher, ImproveButton } from "./components/detail-actions";
import { FocusStage } from "./components/focus-stage";
import { VersionStepper } from "./components/version-stepper";
import { OpenVersionConversation } from "./components/version-list";

export { prototypesGalleryPane, prototypeDetailPane } from "./panes";
export { ScaledIframe } from "./components/scaled-iframe";
export { OptionsPicker } from "./components/options-picker";
export { VersionStepShortcuts } from "./components/version-stepper";
export { FrameSizeProvider, useFrameSizeState } from "./frame-size";
export type { FrameSize, FrameSizeChoice } from "./frame-size";
export {
  PrototypeDetailProvider,
  usePrototypeDetail,
  usePrototypePicks,
  usePrototypeDocumentSrc,
  usePrototypeSrc,
} from "./context";
export { useCloseVersionList } from "./components/version-list";
export type {
  PicksRead,
  PrototypeDetailContextValue,
  PrototypeStage,
} from "./context";
export {
  PrototypeCardActions,
  PrototypeDetailScope,
  PrototypeStages,
  PrototypeVersionActions,
} from "./slots";
export type {
  PrototypeGalleryRow,
  PrototypeStageContribution,
  PrototypeStageProps,
} from "./slots";

export default {
  description:
    "Prototypes gallery list pane and the detail pane whose stage set is a slot (Focus is its own contribution; Compare is a sibling plugin's), with an Improve this prototype affordance, a Done checkbox on every card and in the detail header (filterable and groupable in the gallery), the hover picker for a prototype's declared options (drawn by the app over the stage, never inside the page), and the ‹ v3 of 7 › stepper that points every stage at a recorded version and restores it.",
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
    // `‹ v3 of 7 ›` — which recorded version the stages show. Placed beside
    // the stage switcher by the same authored header order.
    prototypeDetailPane.Actions({ id: "version", component: VersionStepper }),
    prototypeDetailPane.Actions({ id: "improve", component: ImproveButton }),
    // Mark the open prototype Done (the same shared flag as the card checkbox).
    prototypeDetailPane.Actions({ id: "done", component: DoneHeaderAction }),
    // The Done checkbox, painted at rest on every card (`persistent`), so the
    // gallery can be ticked off without opening anything.
    PrototypeCardActions({
      id: "done",
      component: DoneCardAction,
      zone: "persistent",
    }),
    // The pane's own stage, contributed the same way a sibling plugin
    // contributes another (the `compare` plugin's Compare stage).
    PrototypeStages.Stage({
      id: "focus",
      label: "Focus",
      order: 10,
      usesFrameSize: true,
      component: FocusStage,
    }),
    PrototypeVersionActions({
      id: "open-conversation",
      component: OpenVersionConversation,
    }),
  ],
  slots: {
    "prototypes-gallery": prototypesGalleryPane,
    "prototypes-detail": prototypeDetailPane,
    stage: PrototypeStages.Stage,
    "version-actions": PrototypeVersionActions,
    "card-actions": PrototypeCardActions,
    "detail-scope": PrototypeDetailScope,
  },
} satisfies PluginDefinition;
