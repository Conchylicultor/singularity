import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// The only knob for the stall alert side: a mute. The stall THRESHOLD lives in
// health-monitor (the detector) — "what counts as a stall" is the detector's
// concern, not the alert plugin's — so it deliberately does not appear here.
//
// The `name` is a load-bearing literal (persisted config); do not rename.
export const stallMonitorConfig = defineConfig({
  name: "stall-monitor",
  fields: {
    enabled: boolField({
      default: true,
      label: "Enabled",
      description:
        "When off, detected event-loop stalls still capture a trace but file no report.",
    }),
  },
});
