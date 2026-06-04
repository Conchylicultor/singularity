import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGridView } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { compile } from "./compile";
import { ChordGridLoader } from "./loader";

export default {
  name: "Sonata: Chord Grid Source",
  description:
    "Chord-grid input source for Sonata. The grid (e.g. `| C G | Am F |`) authors chord annotations; compile() derives notes from them via the selected voicing strategy.",
  contributions: [
    Sonata.Source({
      id: "chord-grid",
      label: "Chord Grid",
      icon: MdGridView,
      LoaderComponent: ChordGridLoader,
      compile,
    }),
  ],
} satisfies PluginDefinition;
