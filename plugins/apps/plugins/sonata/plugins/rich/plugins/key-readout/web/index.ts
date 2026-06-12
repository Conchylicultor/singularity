import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdVpnKey } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { KeyReadout } from "./components/key-readout";

export default {
  description:
    "Sonata Section: a current-key readout panel that lights the key's scale notes on a mini keyboard, tracking the playback cursor. Reads the shared Score + cursor from useSonata().",
  contributions: [
    Sonata.Section({
      id: "key-readout",
      label: "Current key",
      icon: MdVpnKey,
      component: KeyReadout,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
