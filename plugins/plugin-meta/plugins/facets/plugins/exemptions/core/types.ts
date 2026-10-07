import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

/** One manifest entry, as the docs show it. */
export interface DeclaredExemption {
  rule: string;
  paths: string[];
  kind: "sanctioned" | "debt";
}

/** A plugin that exempts itself from a rule this plugin owns. */
export interface ExemptedBy {
  /** The exempting plugin. */
  plugin: PluginId;
  /** How many of its manifest entries for this plugin's rules are debt. */
  debt: number;
}

export interface ExemptionsData {
  /** What this plugin exempts itself from (its own `exempt/index.ts`). */
  declared: DeclaredExemption[];
  /** Plugins exempting themselves from a rule or check this plugin owns. */
  exemptedBy: ExemptedBy[];
  /** Transient: what extract() read about ownership; relate() resolves and clears it. */
  owns?: { lintNamespace?: string; checkIds: string[] };
}

export const exemptionsFacetDef = defineFacet<ExemptionsData>("exemptions");
