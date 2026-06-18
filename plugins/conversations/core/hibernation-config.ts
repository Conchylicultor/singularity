import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Global idle-hibernation policy. Lives in `conversations/core` (a leaf) so both
// the parent poller (`conversations/server`) and the child `hibernation`
// sub-plugin can read it via `getConfig` without forming an import cycle.
export const hibernationConfig = defineConfig({
  name: "conversation-hibernation",
  fields: {
    enabled: boolField({
      default: true,
      label: "Hibernate idle conversations",
      description:
        "Kill the live process of a waiting conversation after it has been idle for the configured time (and after a reboot), keeping it shown as a normal Waiting conversation. It is silently resumed (claude --resume) the moment you open it.",
    }),
    idleHours: intField({
      default: 48,
      min: 1,
      label: "Idle hours before hibernation",
      description:
        "How long a waiting conversation may sit unopened before its process is killed to reclaim resources.",
    }),
  },
});
