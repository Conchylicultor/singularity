import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// The read-set-shrink monitor's single knob. The scheduled job reads it live via
// getConfig each tick. The `name` is a load-bearing literal (persisted config).
export const readSetShrinkConfig = defineConfig({
  name: "read-set-shrink",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor drains and drops read-set shrink events without filing reports.",
    }),
  },
});
