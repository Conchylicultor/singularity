import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGraphicEq } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata, SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PianoRoll } from "./components/piano-roll";
import { SpreadWheel } from "./components/spread-wheel";
import { pianoRollConfig } from "../shared/config";

// The FX extension point: effect sub-plugins import these from this barrel
// (the only legal cross-plugin path) and contribute headless effects.
export { PianoRollFx } from "./slots";
export type { FxToggleConfig, FxNoteEvent, FxContext } from "./slots";
// The shared, budget-respecting particle pool effects build on (one emitter
// per texture; spawns drop when the pool is full — see particles.ts).
export { createEmitter } from "./internal/fx/particles";
export type { ParticleEmitter, EmitterOptions, SpawnSpec } from "./internal/fx/particles";
export { easeOutCubic } from "./internal/fx/particle-step";

export default {
  description:
    "Sonata Display: Synthesia-like pitch × time piano roll. Draws notes via its published Projection (time-axis + pitch-plane capabilities), auto-scrolls the time axis to keep the playback cursor in view, and hosts capability-compatible overlays.",
  contributions: [
    // `match` is the dispatch key the shell selects on (`key: activeDisplayId`).
    // It equals `id` here so the picker's id and the dispatch key stay in lockstep.
    Sonata.Display({
      match: "piano-roll",
      id: "piano-roll",
      label: "Piano Roll",
      icon: MdGraphicEq,
      capabilities: ["time-axis", "pitch-plane"],
      component: PianoRoll,
    }),
    // Toolbar jog wheel for the roll's vertical zoom (spread), in the toolbar's
    // End zone beside the transport controls. Lives in this plugin (not
    // transport-bar) so it can own the private spread config it persists; the
    // live value is shared via the Sonata transport context.
    SonataToolbar.End({ id: "spread", component: SpreadWheel }),
    ConfigV2.WebRegister({ descriptor: pianoRollConfig }),
    // Surface the roll's display prefs in the player's view-options chip. Only
    // `showNoteNames` — `spread` is driven live by the toolbar jog wheel above,
    // so a second zoom control would be redundant.
    Sonata.ViewOption({
      id: "piano-roll",
      config: pianoRollConfig,
      fields: ["showNoteNames"],
    }),
  ],
} satisfies PluginDefinition;
