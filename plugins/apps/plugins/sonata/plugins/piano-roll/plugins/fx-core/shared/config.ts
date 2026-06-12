import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// The fx-core toggle. ONE bool — the shape the piano-roll FX host gates on
// generically (FxToggleConfig). Ambient tier ships ENABLED by default: the
// effect is restrained enough to be the baseline look.
export const fxCoreConfig = defineConfig({
  fields: {
    enabled: boolField({
      label: "Note glow & sparks",
      description:
        "Soft glow, rising sparks, and a gentle brighten on each note as it crosses the keyboard line.",
      default: true,
    }),
  },
});
