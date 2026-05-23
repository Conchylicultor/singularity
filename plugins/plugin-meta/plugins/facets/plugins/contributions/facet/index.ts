import type { DocMetaContribution, PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  createFacet,
  defineFacet,
  getFacet,
  type ExtractContext,
  type RenderDocContext,
} from "@plugins/plugin-meta/plugins/facets/core";

export const contributionsFacetDef = defineFacet<DocMetaContribution[]>("contributions");

export default createFacet<DocMetaContribution[]>({
  def: contributionsFacetDef,

  extract(ctx: ExtractContext): DocMetaContribution[] {
    const { importedModules } = ctx;
    if (!importedModules || importedModules.length === 0) return [];

    const contributions: DocMetaContribution[] = [];
    for (const { mod } of importedModules) {
      let def: Record<string, unknown> | undefined;
      try {
        def = mod.default as Record<string, unknown> | undefined;
      } catch {
        continue;
      }
      if (!def) continue;

      const rawContributions = def.contributions as
        | Array<Record<string, unknown> & { _slotId?: string; _doc?: { label?: string; detail?: string } }>
        | undefined;
      if (!rawContributions) continue;

      for (const c of rawContributions) {
        if (!c._slotId) continue;
        const comp = c.component;
        const componentName =
          typeof comp === "function" && comp.name ? (comp.name as string) : undefined;
        contributions.push({
          slotId: c._slotId,
          // slotDisplayName filled in by relate()
          componentName,
          doc: c._doc ?? {},
        });
      }
    }
    return contributions;
  },

  relate(rawCtx) {
    const { tree } = rawCtx as { tree: PluginTree };

    // Build slotId → displayName from node.slots (monolithic field, populated before facets run)
    const slotDisplayNames = new Map<string, string>();
    for (const node of tree.byDir.values()) {
      for (const s of node.slots ?? []) {
        if (!slotDisplayNames.has(s.slotId)) {
          slotDisplayNames.set(s.slotId, `${s.groupName}.${s.memberName}`);
        }
      }
    }

    // Fill display names into already-extracted contribution data
    for (const node of tree.byDir.values()) {
      const contribs = getFacet(node, contributionsFacetDef);
      if (!contribs || contribs.length === 0) continue;
      for (const c of contribs) {
        if (!c.slotDisplayName) {
          c.slotDisplayName = slotDisplayNames.get(c.slotId);
        }
      }
    }
  },

  renderDoc(data: DocMetaContribution[], ctx: RenderDocContext): string[] {
    if (data.length === 0) return [];
    const indent = `${ctx.bodyIndent}  `;
    const subIndent = `${ctx.bodyIndent}    `;
    const lines: string[] = [`${indent}- Contributes:`];
    for (const c of data) {
      const parts = [`\`${c.slotDisplayName ?? c.slotId}\``];
      if (c.doc.label) parts.push(`"${c.doc.label}"`);
      if (c.doc.detail) parts.push(`(${c.doc.detail})`);
      if (c.componentName) parts.push(`→ \`${c.componentName}\``);
      lines.push(`${subIndent}- ${parts.join(" ")}`);
    }
    return lines;
  },
});
