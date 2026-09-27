import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { KeyReadout } from "./components/key-readout";
import { KeyReadoutActions } from "./components/key-readout-actions";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Sonata Section: a current-key readout panel that lights the key's scale notes on a mini keyboard, tracking the playback cursor. Reads the shared Score + cursor from useSonata().",
  contributions: [
    Sonata.Section({
      id: "key-readout",
      label: "Current key",
      icon: symbol("vpn-key"),
      component: KeyReadout,
      area: "player",
      actions: KeyReadoutActions,
    }),
  ],
} satisfies PluginDefinition;
