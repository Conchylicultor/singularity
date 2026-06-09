import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginId, RuntimeFolder } from "@plugins/framework/plugins/plugin-id/core";

/** One cross-plugin import: the target plugin id, plus the imported symbol for
 *  named imports (absent for namespace/default/side-effect imports). */
export interface ApiUse {
  plugin: PluginId;
  symbol?: string;
}

/** Transient raw import recorded by extract() (which has no tree); relate()
 *  resolves these to ApiUse via resolvePluginSpecifier and clears the field. */
export interface RawUse {
  specifier: string;
  symbol?: string;
}

export interface CrossRefsData {
  apiUses: Record<RuntimeFolder, ApiUse[]>;
  importedBy: PluginId[];
  raw?: Record<RuntimeFolder, RawUse[]>;
}

export const crossRefsFacetDef = defineFacet<CrossRefsData>("cross-refs");
