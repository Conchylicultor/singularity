import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata, SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { metronomeConfig } from "../shared/config";
import { MetronomeEngine } from "./components/metronome-engine";
import { MetronomeButton } from "./components/metronome-button";
import { CountInOverlay } from "./components/count-in-overlay";

export default {
  description:
    "Sonata metronome: a synthesized click track (continuous + count-in lead-in) scheduled on the engine's audio clock, with a toolbar control and an on-screen countdown.",
  contributions: [
    // Headless audio behaviour: the count-in provider, count-in clicks, and the
    // continuous click track (the engine scheduler reused with a click voice).
    Sonata.Effect({ id: "metronome", component: MetronomeEngine }),
    // Toolbar control: click-track toggle + a settings popover.
    SonataToolbar.End({ id: "metronome", component: MetronomeButton }),
    // The on-screen count-in countdown.
    Sonata.Hud({ id: "count-in", component: CountInOverlay }),
    ConfigV2.WebRegister({ descriptor: metronomeConfig }),
  ],
} satisfies PluginDefinition;
