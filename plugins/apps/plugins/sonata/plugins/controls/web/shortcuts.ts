import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { getSonataTransport } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/** One tempo step per up/down press. (←/→ seek is owned by `SeekHoldController`,
 *  which needs keyup + auto-repeat to distinguish a tap from a press-and-hold —
 *  something the keydown-only shortcut registry can't express.) */
const TEMPO_STEP = 0.1;

/**
 * Gate every Sonata shortcut on the app being mounted: the shell publishes its
 * transport to the module bus only while `SonataProvider` is alive, and
 * `AppsLayout` mounts just the active app — so a non-null transport means Sonata
 * is on screen. When it isn't, the shortcuts no-op AND don't `preventDefault`,
 * leaving the keys (Space, arrows) to the rest of the app.
 */
const whenSonataActive = () => getSonataTransport() !== null;

/** The Sonata transport keyboard shortcuts, contributed by the controls barrel. */
export const transportShortcuts = [
  defineShortcut({
    id: "sonata.play-pause",
    keys: "space",
    label: "Play / pause",
    group: "Sonata",
    when: whenSonataActive,
    handler: () => getSonataTransport()?.togglePlay(),
  }),
  defineShortcut({
    id: "sonata.tempo-up",
    keys: "arrowup",
    label: "Speed up",
    group: "Sonata",
    when: whenSonataActive,
    handler: () => getSonataTransport()?.nudgeTempo(TEMPO_STEP),
  }),
  defineShortcut({
    id: "sonata.tempo-down",
    keys: "arrowdown",
    label: "Slow down",
    group: "Sonata",
    when: whenSonataActive,
    handler: () => getSonataTransport()?.nudgeTempo(-TEMPO_STEP),
  }),
];
