import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdDonutLarge } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { CircleOfFifths } from "./components/circle-of-fifths";

export default {
  description:
    "Sonata Section: a small circle-of-fifths wheel — major keys on the outer ring, their relative minors on the inner ring — that highlights the chord under the playback cursor, reading the shared Score + cursor from useSonata().",
  contributions: [
    Sonata.Section({
      id: "circle-of-fifths",
      label: "Circle of fifths",
      icon: MdDonutLarge,
      component: CircleOfFifths,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
