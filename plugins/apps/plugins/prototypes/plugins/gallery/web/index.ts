import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { prototypesGalleryPane } from "./panes";
import { PrototypeCardActions } from "./slots";
import { DoneCardAction, DoneHeaderAction } from "./components/done-toggle";

export { prototypesGalleryPane } from "./panes";
export {
  mintPrototypeFolder,
  newPrototypePrompt,
} from "./components/new-prototype";
export { useSetPrototypeDone } from "./components/done-toggle";
export { PrototypeCardActions } from "./slots";
export type { PrototypeGalleryRow } from "./slots";

export default {
  description:
    "Prototypes gallery list pane — one card per prototype over its rendered preview, grouped and filterable by a Done checkbox on every card (and in the detail pane's header) — plus New prototype, which mints the folder before launching the agent that designs it.",
  contributions: [
    Pane.Register({ pane: prototypesGalleryPane }),
    // Mark the open prototype Done — the same shared flag as the card
    // checkbox, contributed into the canvas plugin's detail header.
    prototypeDetailPane.Actions({ id: "done", component: DoneHeaderAction }),
    // The Done checkbox, painted at rest on every card (`persistent`), so the
    // gallery can be ticked off without opening anything.
    PrototypeCardActions({
      id: "done",
      component: DoneCardAction,
      zone: "persistent",
    }),
  ],
  slots: {
    "prototypes-gallery": prototypesGalleryPane,
    "card-actions": PrototypeCardActions,
  },
} satisfies PluginDefinition;
