import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// The session-divergence monitor's knobs. The scheduled job reads them live via
// getConfig each tick. The `name` is a load-bearing literal (persisted config).
export const sessionDivergenceConfig = defineConfig({
  name: "session-divergence",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, the monitor job returns early and files no session-divergence reports.",
    }),
    graceMinutes: intField({
      default: 2,
      min: 0,
      label: "Grace window (minutes)",
      description:
        "How far a subtree session's transcript may lead the chain tail's before the divergence is reported. Absorbs the legitimate window where a freshly-forked session is already writing but the poller has not yet appended it to the chain.",
    }),
  },
});
