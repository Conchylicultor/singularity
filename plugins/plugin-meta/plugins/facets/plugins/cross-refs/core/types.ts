import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

const RUNTIMES = ["server", "central", "web", "core", "shared"] as const;
type Runtime = (typeof RUNTIMES)[number];

export interface CrossRefsData {
  apiUses: Record<Runtime, string[]>;
  importedBy: string[];
}

export const crossRefsFacetDef = defineFacet<CrossRefsData>("cross-refs");
