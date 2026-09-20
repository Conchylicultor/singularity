import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { revealConfig } from "../shared/config";

export { useReveal } from "./internal/use-reveal";
export { RevealSwitch } from "./components/reveal-switch";
export { RevealKeyboardCard } from "./components/reveal-keyboard";

export default {
  description:
    "How much of a chord the Chord trainer shows: the reveal setting (off / names / names and keyboard), the <RevealSwitch> the side panel puts above its stats, and <RevealKeyboardCard> — the chord on show as a piano lighting exactly the notes the app's own piano plays for it, named in the song's key.",
  contributions: [ConfigV2.WebRegister({ descriptor: revealConfig })],
} satisfies PluginDefinition;
