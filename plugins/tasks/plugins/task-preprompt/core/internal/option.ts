import { z } from "zod";
import { defineLaunchOption } from "@plugins/tasks/plugins/launch-options/core";

/**
 * The preprompt prepended to the agent's first turn. `null` = none; the id is a
 * `preprompts` config list-item, so it is validated on read, not here.
 */
export const prepromptLaunchOption = defineLaunchOption<string | null>({
  id: "preprompt",
  schema: z.string().min(1).nullable(),
  defaultValue: null,
});
