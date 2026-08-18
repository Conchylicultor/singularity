import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  GrowRelay,
  useRequestGrow,
  type GrowGrant,
} from "./internal/grow-relay";

export default {
  description:
    "The grow request: a widget that sizes itself from the room it is given asks for that room (useRequestGrow), every box in between relays the ask upward (<GrowRelay>, render-prop), and the row stops it (<GrowRelay.Stop>). Replaces the fill flag a contribution had to declare three files away from the <AdaptiveBar> it was about — the ask travels with the widget, so there is nothing left to forget.",
  contributions: [],
} satisfies PluginDefinition;
