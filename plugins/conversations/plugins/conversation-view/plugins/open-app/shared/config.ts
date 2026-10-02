import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * Where a plain click on the conversation's Open app button opens the agent's
 * app. ⌘/middle-click always takes the other way.
 */
export const openAppConfig = defineConfig({
  fields: {
    target: enumField({
      label: "Open app in",
      description:
        "Where a plain click on Open app opens the agent's app. ⌘/middle-click opens it the other way.",
      options: [
        { value: "new-tab", label: "New browser tab" },
        { value: "pane", label: "Pane beside the conversation" },
      ],
      default: "new-tab",
    }),
  },
});
