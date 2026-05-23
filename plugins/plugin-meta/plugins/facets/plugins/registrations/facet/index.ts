import type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  createFacet,
  defineFacet,
  type ExtractContext,
  type RenderDocContext,
} from "@plugins/plugin-meta/plugins/facets/core";

export const registrationsFacetDef = defineFacet<DocMetaRegistration[]>("registrations");

export default createFacet<DocMetaRegistration[]>({
  def: registrationsFacetDef,

  extract(ctx: ExtractContext): DocMetaRegistration[] {
    const { importedModules } = ctx;
    if (!importedModules || importedModules.length === 0) return [];

    const registrations: DocMetaRegistration[] = [];
    for (const { mod, runtime } of importedModules) {
      if (runtime !== "server" && runtime !== "central") continue;
      let def: Record<string, unknown> | undefined;
      try {
        def = mod.default as Record<string, unknown> | undefined;
      } catch {
        continue;
      }
      if (!def) continue;
      const rawRegister = def.register as
        | Array<{ _kind?: string; _factory?: string; _doc?: { label?: string; detail?: string } }>
        | undefined;
      if (!rawRegister) continue;
      for (const r of rawRegister) {
        if (r._kind) {
          registrations.push({
            kind: r._kind,
            factory: r._factory,
            runtime,
            doc: r._doc ?? {},
          });
        }
      }
    }
    return registrations;
  },

  renderDoc(data: DocMetaRegistration[], ctx: RenderDocContext): string[] {
    if (data.length === 0) return [];
    const indent = `${ctx.bodyIndent}  `;
    const lines: string[] = [];
    for (const runtime of ["server", "central"] as const) {
      const regs = data.filter((r) => r.runtime === runtime);
      if (regs.length === 0) continue;
      lines.push(`${indent}- Register: ${regs.map(formatRegistration).join(", ")}`);
    }
    return lines;
  },
});

function formatRegistration(r: DocMetaRegistration): string {
  const label = r.doc.label;
  if (!r.factory) return `\`${label ?? r.kind}\``;
  return label ? `\`${r.factory}('${label}')\`` : `\`${r.factory}()\``;
}
