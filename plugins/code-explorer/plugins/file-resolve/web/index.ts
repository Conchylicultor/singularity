import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useResolvedFile,
  type ResolvedFileState,
} from "./internal/use-resolved-file";
export { FileDisambiguation } from "./internal/file-disambiguation";

export default {
  id: "code-explorer-file-resolve",
  name: "Code Explorer: File Resolve",
  description:
    "Fuzzy file path resolution via segment-subsequence matching against git ls-files.",
  contributions: [],
} satisfies PluginDefinition;
