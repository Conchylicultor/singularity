import { basename, join } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import {
  createFacet,
  defineFacet,
  getFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";

const RUNTIMES = ["server", "central", "web", "core", "shared"] as const;
type Runtime = (typeof RUNTIMES)[number];

export interface CrossRefsData {
  apiUses: Record<Runtime, string[]>;
  importedBy: string[];
}

export const crossRefsFacetDef = defineFacet<CrossRefsData>("cross-refs");

// ── Helpers ────────────────────────────────────────────────────────────

function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "plugins") continue;
      walkFiles(p, out);
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
}

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function parseApiUses(runtimeDir: string, selfName: string, runtime: Runtime): string[] {
  const files: string[] = [];
  walkFiles(runtimeDir, files);
  const uses = new Set<string>();
  const modRe = new RegExp(`@plugins\\/([^/"'\`]+)\\/${runtime}(?:\\/(?:api(?:\\/index)?|index))?$`);
  const namedRe =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  const nsRe =
    /import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const defRe = /import\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const sideRe = /import\s*["']([^"']+)["']/g;

  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    let m: RegExpExecArray | null;
    while ((m = namedRe.exec(src))) {
      const mod = m[3]!;
      const hit = mod.match(modRe);
      if (!hit) continue;
      const plug = hit[1]!;
      if (plug === selfName) continue;
      for (const raw of m[2]!.split(",")) {
        let s = raw.trim();
        if (!s) continue;
        s = s.replace(/^type\s+/, "");
        const asMatch = s.match(/^(\w+)\s+as\s+\w+$/);
        const orig = asMatch ? asMatch[1]! : s;
        if (/^\w+$/.test(orig)) uses.add(`${plug}.${orig}`);
      }
    }
    for (const re of [nsRe, defRe, sideRe]) {
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const hit = m[1]!.match(modRe);
        if (!hit) continue;
        const plug = hit[1]!;
        if (plug !== selfName) uses.add(plug);
      }
    }
  }
  return Array.from(uses).sort();
}

// ── Facet ──────────────────────────────────────────────────────────────

export default createFacet<CrossRefsData>({
  def: crossRefsFacetDef,

  extract(ctx) {
    const selfName = basename(ctx.dir);
    const apiUses = {
      server: [] as string[],
      central: [] as string[],
      web: [] as string[],
      core: [] as string[],
      shared: [] as string[],
    };
    for (const rt of RUNTIMES) {
      const rtDir = join(ctx.dir, rt);
      if (existsSync(rtDir)) {
        apiUses[rt] = parseApiUses(rtDir, selfName, rt);
      }
    }
    return { apiUses, importedBy: [] };
  },

  relate(ctx: unknown) {
    const { tree } = ctx as { tree: PluginTree };
    const byName = new Map<string, { name: string; facets: Record<string, unknown> }>();
    for (const node of tree.byDir.values()) byName.set(node.name, node);

    for (const importer of tree.byDir.values()) {
      const data = getFacet(importer, crossRefsFacetDef);
      if (!data) continue;
      const referenced = new Set<string>();
      for (const rt of RUNTIMES) {
        for (const u of data.apiUses[rt]) {
          referenced.add(u.split(".")[0]!);
        }
      }
      for (const targetName of referenced) {
        const target = byName.get(targetName);
        if (!target || target === importer) continue;
        const targetData = getFacet(target, crossRefsFacetDef);
        if (targetData && !targetData.importedBy.includes(importer.name)) {
          targetData.importedBy.push(importer.name);
        }
      }
    }
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, crossRefsFacetDef);
      if (data) data.importedBy.sort();
    }
  },

  renderDoc(data, ctx) {
    const lines: string[] = [];
    const subIndent = `${ctx.bodyIndent}  `;
    for (const rt of RUNTIMES) {
      if (data.apiUses[rt].length > 0) {
        lines.push(`${subIndent}- Uses (${rt}): ${data.apiUses[rt].map((n) => `\`${n}\``).join(", ")}`);
      }
    }
    if (data.importedBy.length > 0) {
      lines.push(`${subIndent}- Imported by: ${data.importedBy.map((n) => `\`${n}\``).join(", ")}`);
    }
    return lines;
  },
});
