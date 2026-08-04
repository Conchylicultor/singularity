import { defineLaunchOption } from "@plugins/tasks/plugins/launch-options/core";
import {
  ConversationModelSchema,
  DEFAULT_MODEL,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";

/**
 * Which model the task auto-starts with. `null` is the single off-sentinel —
 * the draft form used to spell it `"queue"` and the detail card `"none"`; one
 * contribution means one vocabulary on both surfaces.
 */
export const autoStartLaunchOption = defineLaunchOption<ConversationModel | null>(
  {
    id: "auto-start",
    schema: ConversationModelSchema.nullable(),
    // A fresh draft card auto-launches — the popover's long-standing default.
    // An existing task ignores this and reads its own row (`useTaskBinding`).
    defaultValue: DEFAULT_MODEL,
  },
);
