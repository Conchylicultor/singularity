import type { PluginDefinition } from "@core";
import { ActiveData } from "@plugins/active-data/web";
import { TokenChip } from "./components/token-chip";
import { EXIT_CLEAN_RE, FLAG_RAISE_RE } from "./internal/patterns";

export default {
  id: "active-data-tokens",
  name: "Active Data: exit tokens",
  description:
    "Renders EXIT_CLEAN and FLAG_RAISE tokens as visual chips in assistant text.",
  contributions: [
    ActiveData.Tag({ pattern: EXIT_CLEAN_RE, component: TokenChip }),
    ActiveData.Tag({ pattern: FLAG_RAISE_RE, component: TokenChip }),
  ],
} satisfies PluginDefinition;
