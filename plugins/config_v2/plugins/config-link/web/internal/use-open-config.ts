import { useCallback } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { configDetailPane } from "@plugins/config_v2/plugins/settings/web";

// Returns a navigator that jumps straight to a config descriptor's settings
// section. The descriptor is the link: it self-identifies its settings location
// through the existing ConfigV2.WebRegister registry, so no per-surface wiring
// (and no extra registry) is needed — pass the same descriptor the surface
// already reads with useConfig().
export function useOpenConfig() {
  const registrations = useConfigRegistrations();
  const openPane = useOpenPane();
  return useCallback(
    (descriptor: ConfigDescriptor) => {
      const reg = registrations.find((r) => r.descriptor === descriptor);
      if (!reg) {
        throw new Error(
          "useOpenConfig: descriptor is not registered via ConfigV2.WebRegister — " +
            "it has no settings section to open.",
        );
      }
      // configDetailPane has defaultAncestors: [configNavPane], so a "root" open
      // rebuilds the full nav + detail chain focused on this descriptor.
      openPane(
        configDetailPane,
        { configPath: encodeURIComponent(reg.storePath) },
        { mode: "root" },
      );
    },
    [registrations, openPane],
  );
}
