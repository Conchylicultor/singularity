import { useConfig } from "@plugins/config_v2/web";
import {
  asSonataLook,
  SONATA_LOOK_STYLES,
  sonataLookConfig,
  type SonataKeys,
} from "@plugins/apps/plugins/sonata/plugins/look/core";

/**
 * The key skin Sonata's own surfaces wear: whatever the app's look is set to.
 *
 * This is a hook and NOT part of {@link Keyboard}, and the distinction matters.
 * The component used to read this config itself, which quietly made it unusable
 * outside Sonata: `useConfig` throws when nothing has registered the descriptor,
 * and only Sonata's `look` plugin registers this one. A keyboard drawn in
 * another app (the Chord trainer's piano) therefore crashed on render — an
 * undeclared dependency on a *different plugin's web registration*, which no
 * type or check could see.
 *
 * So the component takes its skin as data, and this hook is how a caller that
 * wants SONATA's setting asks for it. Every Sonata surface calls it, so one
 * control still paints every keyboard in the app. A caller outside Sonata picks
 * a skin from `SONATA_LOOK_STYLES` and never reaches a config that is not
 * theirs.
 */
export function useSonataKeySkin(): SonataKeys {
  const { look } = useConfig(sonataLookConfig);
  return SONATA_LOOK_STYLES[asSonataLook(look)].keys;
}
