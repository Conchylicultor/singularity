import type { PluginDefinition } from "@core";

export { Rank, RankSchema } from "../core";

export default {
  id: "rank",
  name: "Rank",
  description:
    "Fractional-indexing rank primitive. THE authoritative source for sortable rank strings — use nextRankIn()/nextRankUnder() from the server barrel for new insertions; use computeDrop() from the tree plugin for DnD moves. Never use floats or integers.",
  contributions: [],
} satisfies PluginDefinition;
