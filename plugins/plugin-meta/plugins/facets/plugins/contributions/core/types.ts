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
}

export interface ContributionsFacetData {
  static: Contribution[];
  runtime: DocMetaContribution[];
  slotContributors: string[];
}

export const contributionsFacetDef = defineFacet<ContributionsFacetData>("contributions");
