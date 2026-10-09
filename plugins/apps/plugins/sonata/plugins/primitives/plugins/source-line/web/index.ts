import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SourceLine } from "./internal/source-line";
export type { SourceLineProps } from "./internal/source-line";

export default {
  description:
    "The one line that names a loaded source in Sonata's inspector (an Ultimate Guitar tab, a recording's video): a truncating title with an optional inline badge, a muted subtitle beneath, a trailing action centred across both lines, and an optional expanded area below (e.g. the Replace URL row).",
  contributions: [],
} satisfies PluginDefinition;
