import { join } from "path";
import { existsSync } from "fs";
import {
  createFacet,
  getFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { resolvePluginSpecifier } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  RUNTIME_FOLDERS,
  type RuntimeFolder,
  asPath,
} from "@plugins/framework/plugins/plugin-id/core";
import { walkFiles, readIfExists, maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type CrossRefsData, type RawUse, crossRefsFacetDef } from "../core";

// ── Helpers ────────────────────────────────────────────────────────────

// Records every `@plugins/…` import in `runtimeDir` as a RawUse. No tree is
// available at extract() time, so we do NOT resolve, self-skip, or filter by
// runtime here — that happens in relate(). Comments/regex are masked (keeping
// import-path strings) so a commented-out import doesn't register a phantom use.
function parseRawUses(runtimeDir: string): RawUse[] {
  const files: string[] = [];
  walkFiles(runtimeDir, files);
  const uses: RawUse[] = [];
  const seen = new Set<string>();
  const namedRe =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  const nsRe =
    /import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const defRe = /import\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const sideRe = /import\s*["']([^"']+)["']/g;

  const add = (specifier: string, symbol?: string) => {
    const key = `${specifier}::${symbol ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    uses.push(symbol === undefined ? { specifier } : { specifier, symbol });
  };

  for (const f of files) {
    const raw = readIfExists(f);
    if (!raw) continue;
    const src = maskSource(raw, { strings: false });
    let m: RegExpExecArray | null;
    namedRe.lastIndex = 0;
    while ((m = namedRe.exec(src))) {
      const mod = m[3]!;
      if (!mod.startsWith("@plugins/")) continue;
      // A default import alongside named ones (`import Foo, { a, b } from …`)
      // is a default — record it without a symbol.
      if (m[1]) add(mod);
      for (const part of m[2]!.split(",")) {
        let s = part.trim();
        if (!s) continue;
        s = s.replace(/^type\s+/, "");
        const asMatch = s.match(/^(\w+)\s+as\s+\w+$/);
        const orig = asMatch ? asMatch[1]! : s;
        if (/^\w+$/.test(orig)) add(mod, orig);
      }
    }
    for (const re of [nsRe, defRe, sideRe]) {
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const mod = m[1]!;
        if (mod.startsWith("@plugins/")) add(mod);
      }
    }
  }
  return uses;
}

function emptyByRuntime<T>(): Record<RuntimeFolder, T[]> {
  const out = {} as Record<RuntimeFolder, T[]>;
  for (const rt of RUNTIME_FOLDERS) out[rt] = [];
  return out;
}

// ── Facet ──────────────────────────────────────────────────────────────

export default createFacet<CrossRefsData>({
  def: crossRefsFacetDef,

  extract(ctx) {
    const raw = emptyByRuntime<RawUse>();
    for (const rt of RUNTIME_FOLDERS) {
      const rtDir = join(ctx.dir, rt);
      if (existsSync(rtDir)) raw[rt] = parseRawUses(rtDir);
    }
    return { apiUses: emptyByRuntime(), importedBy: [], raw };
  },

  relate(ctx: unknown) {
    const { tree } = ctx as { tree: PluginTree };
    const byId = new Map(
      Array.from(tree.byDir.values()).map((node) => [node.id, node]),
    );

    // First pass — resolve each raw `@plugins/…` specifier into apiUses.
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, crossRefsFacetDef);
      if (!data?.raw) continue;
      for (const rt of RUNTIME_FOLDERS) {
        const seen = new Set<string>();
        for (const use of data.raw[rt]) {
          const r = resolvePluginSpecifier(tree, use.specifier);
          if (!r)
            throw new Error(
              `cross-refs facet: import "${use.specifier}" (in plugin ${node.id}/${rt}) resolved to no plugin node`,
            );
          if (r.node === node) continue; // self-skip
          if (r.suffix[0] !== rt) continue; // same-runtime filter
          const key = `${r.node.id}:${use.symbol ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          data.apiUses[rt].push({ plugin: r.node.id, symbol: use.symbol });
        }
      }
      // Clear the transient raw data so it doesn't leak into stored facet data.
      data.raw = undefined;
    }

    // Second pass — invert apiUses into importedBy.
    for (const importer of tree.byDir.values()) {
      const data = getFacet(importer, crossRefsFacetDef);
      if (!data) continue;
      const referenced = new Set(
        RUNTIME_FOLDERS.flatMap((rt) => data.apiUses[rt].map((u) => u.plugin)),
      );
      for (const targetId of referenced) {
        const target = byId.get(targetId);
        if (!target || target === importer) continue;
        const td = getFacet(target, crossRefsFacetDef);
        if (td && !td.importedBy.includes(importer.id))
          td.importedBy.push(importer.id);
      }
    }

    // Stable output.
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, crossRefsFacetDef);
      if (!data) continue;
      data.importedBy.sort();
      for (const rt of RUNTIME_FOLDERS)
        data.apiUses[rt].sort((a, b) =>
          `${a.plugin}:${a.symbol ?? ""}`.localeCompare(
            `${b.plugin}:${b.symbol ?? ""}`,
          ),
        );
    }
  },

  renderDoc(data) {
    const facts: DocFact[] = [];
    for (const rt of RUNTIME_FOLDERS) {
      if (data.apiUses[rt].length > 0) {
        facts.push({
          folder: rt,
          key: "Uses",
          values: data.apiUses[rt].map(
            (u) => `\`${asPath(u.plugin)}${u.symbol ? "." + u.symbol : ""}\``,
          ),
        });
      }
    }
    if (data.importedBy.length > 0) {
      facts.push({
        folder: "cross-plugin",
        key: "Imported by",
        values: data.importedBy.map((id) => `\`${asPath(id)}\``),
      });
    }
    return facts;
  },
});
