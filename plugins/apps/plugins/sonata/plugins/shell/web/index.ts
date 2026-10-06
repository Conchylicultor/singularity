import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { sonataApp } from "../core";
import { SonataLayout } from "./components/sonata-layout";
import { Sonata } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Sonata, SonataSectionItem } from "./slots";
export type { SonataSection } from "./slots";
export { useSonataApp, type SonataAppValue } from "./app";
export {
  LaneInsetsProvider,
  useLaneInsets,
  type LaneInsets,
} from "./lane-insets";

export default {
  description:
    "App shell for Sonata. Registers the /sonata app entry (SonataLayout: one SonataPlayerScope around the pane router), owns the app state — the open song (useSonataApp) — and defines the app-level Sonata.{Overlay,TransportOverlay,TransportEdge,PitchAxis,Home,Effect,Hud,ViewOption,Section} slots.",
  contributions: [
    Apps.App({
      app: sonataApp,
      icon: appIcon(symbol("piano")),
      component: SonataLayout,
    }),
  ],
  slots: { ...Sonata },
} satisfies PluginDefinition;
