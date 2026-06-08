import { join } from "path";
import {
  createFacet,
  getFacet,
  type DocFact,
} from "@plugins/plugin-meta/plugins/facets/core";
import type {
  PluginNode,
  PluginTree,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  readIfExists,
  stripTypes,
  matchBracket,
  maskSource,
  walkFiles,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type RouteDef, type RoutesData, routesFacetDef } from "../core";

export default createFacet<RoutesData>({
  def: routesFacetDef,

  extract(ctx) {
    const routes: RouteDef[] = [];

    // ── HTTP routes: collect defineEndpoint({ route: "..." }) from core/**/*.ts
    const coreFiles: string[] = [];
    walkFiles(join(ctx.dir, "core"), coreFiles);

    const endpointRoutes = new Map<string, string>(); // exportName → routeString
    for (const file of coreFiles) {
      if (!file.endsWith(".ts")) continue;
      const raw = readIfExists(file);
      if (!raw) continue;
      const src = stripTypes(raw);
      const exportRe = /export\s+const\s+(\w+)\s*=\s*defineEndpoint\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = exportRe.exec(src))) {
        const name = m[1]!;
        const parenStart = m.index + m[0].length - 1;
        const parenEnd = matchBracket(src, parenStart, "(", ")");
        if (parenEnd < 0) continue;
        const body = src.slice(parenStart + 1, parenEnd);
        const routeMatch = /route\s*:\s*"([^"]+)"/.exec(body);
        if (routeMatch) endpointRoutes.set(name, routeMatch[1]!);
      }
    }

    // ── For each runtime, scan the barrel for httpRoutes and wsRoutes ─────────
    for (const runtime of ["server", "central"] as const) {
      const barrelPath = join(ctx.dir, runtime, "index.ts");
      const raw = readIfExists(barrelPath);
      if (!raw) continue;
      const src = stripTypes(raw);

      // httpRoutes: { ... }
      const httpIdx = src.search(/\bhttpRoutes\s*:\s*\{/);
      if (httpIdx >= 0) {
        const blockStart = src.indexOf("{", httpIdx);
        const blockEnd = matchBracket(src, blockStart, "{", "}");
        if (blockEnd >= 0) {
          const block = src.slice(blockStart + 1, blockEnd);

          const computedRe = /\[\s*(\w+)\s*\.\s*\w+\s*\]/g;
          let km: RegExpExecArray | null;
          while ((km = computedRe.exec(block))) {
            const routeStr = endpointRoutes.get(km[1]!);
            if (routeStr) routes.push({ route: routeStr, type: "http", runtime, name: km[1]! });
          }

          const literalRe = /"([^"]+)"\s*:/g;
          while ((km = literalRe.exec(block))) {
            routes.push({ route: km[1]!, type: "http", runtime });
          }
        }
      }

      // wsRoutes: { ... }
      const wsIdx = src.search(/\bwsRoutes\s*:\s*\{/);
      if (wsIdx >= 0) {
        const wsStart = src.indexOf("{", wsIdx);
        const wsEnd = matchBracket(src, wsStart, "{", "}");
        if (wsEnd >= 0) {
          const wsBlock = src.slice(wsStart + 1, wsEnd);
          const keyRe = /"([^"]+)"\s*:/g;
          let km: RegExpExecArray | null;
          while ((km = keyRe.exec(wsBlock))) {
            routes.push({ route: km[1]!, type: "ws", runtime });
          }
        }
      }
    }

    return { routes, endpointCallers: [] };
  },

  relate(rawCtx) {
    const { tree } = rawCtx as { tree: PluginTree };

    const apiPrefixToOwner = new Map<string, PluginNode>();
    for (const info of tree.byDir.values()) {
      const facetData = getFacet(info, routesFacetDef);
      if (!facetData) continue;
      for (const r of facetData.routes) {
        if (r.type !== "http") continue;
        const pathMatch = r.route.match(/^\S+\s+\/api\/([A-Za-z0-9_-]+)/);
        if (!pathMatch) continue;
        const prefix = pathMatch[1]!;
        if (!apiPrefixToOwner.has(prefix)) apiPrefixToOwner.set(prefix, info);
      }
    }

    if (apiPrefixToOwner.size === 0) return;

    const prefixes = [...apiPrefixToOwner.keys()];
    const escaped = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`\\/api\\/(${escaped.join("|")})(?![A-Za-z0-9_-])`, "g");

    for (const caller of tree.byDir.values()) {
      const files: string[] = [];
      for (const sub of ["web", "server", "central"]) {
        walkFiles(join(caller.dir, sub), files);
      }
      const hit = new Set<string>();
      for (const f of files) {
        const raw = readIfExists(f);
        if (!raw) continue;
        // Mask comments/regex (keep URL string literals) so a commented or
        // documented `/api/<prefix>` doesn't register a phantom endpoint caller.
        const src = maskSource(raw, { strings: false });
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) hit.add(m[1]!);
      }
      for (const prefix of hit) {
        const owner = apiPrefixToOwner.get(prefix);
        if (!owner || owner === caller) continue;
        const ownerData = getFacet(owner, routesFacetDef);
        if (ownerData && !ownerData.endpointCallers.includes(caller.name)) {
          ownerData.endpointCallers.push(caller.name);
        }
      }
    }
    for (const info of tree.byDir.values()) {
      const data = getFacet(info, routesFacetDef);
      if (data) data.endpointCallers.sort();
    }
  },

  renderDoc(data) {
    if (data.routes.length === 0 && data.endpointCallers.length === 0) return [];
    const facts: DocFact[] = [];
    for (const runtime of ["server", "central"] as const) {
      const httpRoutes = data.routes.filter((r) => r.runtime === runtime && r.type === "http");
      const wsRoutes = data.routes.filter((r) => r.runtime === runtime && r.type === "ws");
      if (httpRoutes.length > 0 || wsRoutes.length > 0) {
        facts.push({ folder: runtime, key: "Routes", values: [
          ...httpRoutes.map((r) => `\`${r.route}\``),
          ...wsRoutes.map((r) => `\`${r.route} (WS)\``),
        ] });
      }
    }
    if (data.endpointCallers.length > 0) {
      facts.push({ folder: "cross-plugin", key: "Endpoint callers", values: data.endpointCallers.map((n) => `\`${n}\``) });
    }
    return facts;
  },
});
