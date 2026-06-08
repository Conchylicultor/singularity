import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { DocMeta } from "@plugins/framework/plugins/web-sdk/core";

export interface Contribution {
  slot: string;
  props: Record<string, string>;
  paneId?: string;
  panePath?: string;
}

export interface DocMetaContribution {
  slotId: string;
  slotDisplayName?: string;
  componentName?: string;
  doc: DocMeta;
  /**
   * The contribution's own `id` field, when present. Combined with `pluginId`
   * this yields the stable reorder `entryKey` (`pluginId ? `${pluginId}:${id}` :
   * id`). Raw — not computed here; consumers build the catalog key.
   */
  id?: string;
  /** The id of the plugin that authored this contribution (`_pluginId`). */
  pluginId?: string;
}

export interface ContributionsFacetData {
  static: Contribution[];
  runtime: DocMetaContribution[];
  slotContributors: string[];
}

export const contributionsFacetDef = defineFacet<ContributionsFacetData>("contributions");
