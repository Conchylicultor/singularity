import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { taskDraftConfig } from "../shared/config";
import { Specimens } from "@plugins/plugin-meta/plugins/specimens/web";
import { TaskDraftFormSlots as TaskDraftFormSlotGroup } from "./slots";
import { ComposerSpecimen } from "./components/composer-specimen";
import { FormSpecimen } from "./components/form-specimen";

export { TaskDraftPopover } from "./components/task-draft-popover";
export type {
  TaskDraftPopoverProps,
  TaskDraftRelate,
} from "./components/task-draft-popover";
export type { CardDraft } from "./components/task-draft-form";

export {
  setActiveRelateContext,
  useActiveRelateContext,
} from "./active-relate-context";
export type { ActiveRelateContext } from "./active-relate-context";

export { TaskDraftFormSlots } from "./slots";
export type { TaskDraftActionProps } from "./slots";

export { draftInsert } from "./insert-request";
export type { TaskDraftInsert } from "./insert-request";

export default {
  description:
    "Reusable popover + chain form for drafting one or more tasks. Powers the Improve toolbar button and the conversation new-child-task button.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: taskDraftConfig }),
    Specimens.Specimen({
      match: "task-draft/composer",
      label: "Task composer (Improve)",
      widths: [360, 480, 640, 900],
      component: ComposerSpecimen,
    }),
    Specimens.Specimen({
      match: "task-draft/form",
      label: "Task draft form (Improve popover)",
      // The form is a fixed 480px column; these frame it with and without room.
      widths: [480, 640],
      component: FormSpecimen,
    }),
  ],
  slots: TaskDraftFormSlotGroup,
} satisfies PluginDefinition;
