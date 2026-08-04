import { defineLaunchOption } from "@plugins/tasks/plugins/launch-options/core";
import {
  EffortLevelSchema,
  type EffortLevel,
} from "@plugins/conversations/plugins/effort-provider/core";

/** The thinking mode the agent runs at. `null` = Claude Code's own default. */
export const effortLaunchOption = defineLaunchOption<EffortLevel | null>({
  id: "effort",
  schema: EffortLevelSchema.nullable(),
  defaultValue: null,
});
