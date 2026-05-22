import { join } from "path";
import {
  createFacet,
  defineFacet,
  getFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  type RouteDef,
  type PluginNode,
  type PluginTree,
  readIfExists,
  stripTypes,
  matchBracket,
  walkFiles,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";

export const routesFacetDef = defineFacet<RouteDef[]>("routes");

export default createFacet<RouteDef[]>({
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
        // m[0] ends with "(", so parenStart is the last char of the match
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

          // Computed keys: [endpointName.property]
          const computedRe = /\[\s*(\w+)\s*\.\s*\w+\s*\]/g;
          let km: RegExpExecArray | null;
          while ((km = computedRe.exec(block))) {
            const routeStr = endpointRoutes.get(km[1]!);
            if (routeStr) routes.push({ route: routeStr, type: "http", runtime, name: km[1]! });
          }

          // Literal string keys (rare legacy routes)
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

    return routes;
  },

  relate(rawCtx) {
    const { tree } = rawCtx as { tree: PluginTree };

    // Build prefix → owner map using correct facet data
    // (the monolithic apiPrefixToOwner in buildPluginTree runs on parseRouteMap
    // output which misses all [endpoint.route] computed keys)
    const apiPrefixToOwner = new Map<string, PluginNode>();
    for (const info of tree.byDir.values()) {
      const facetRoutes = getFacet(info, routesFacetDef) ?? [];
      for (const r of facetRoutes) {
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

    // Clear callers populated by the broken monolithic pass, then repopulate
    for (const info of tree.byDir.values()) info.endpointCallers = [];

    for (const caller of tree.byDir.values()) {
      const files: string[] = [];
      for (const sub of ["web", "server", "central"]) {
        walkFiles(join(caller.dir, sub), files);
      }
      const hit = new Set<string>();
      for (const f of files) {
        const src = readIfExists(f);
        if (!src) continue;
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) hit.add(m[1]!);
      }
      for (const prefix of hit) {
        const owner = apiPrefixToOwner.get(prefix);
        if (!owner || owner === caller) continue;
        if (!owner.endpointCallers.includes(caller.name)) {
          owner.endpointCallers.push(caller.name);
        }
      }
    }
    for (const info of tree.byDir.values()) info.endpointCallers.sort();
  },

  renderDoc(data, ctx) {
    if (data.length === 0) return [];
    const subIndent = `${ctx.bodyIndent}  `;
    const lines: string[] = [];
    const serverHttp  = data.filter((r) => r.runtime === "server"  && r.type === "http");
    const serverWs    = data.filter((r) => r.runtime === "server"  && r.type === "ws");
    const centralHttp = data.filter((r) => r.runtime === "central" && r.type === "http");
    const centralWs   = data.filter((r) => r.runtime === "central" && r.type === "ws");
    if (serverHttp.length > 0 || serverWs.length > 0) {
      lines.push(
        `${subIndent}- Server routes: ${[
          ...serverHttp.map((r) => `\`${r.route}\``),
          ...serverWs.map((r) => `\`${r.route} (WS)\``),
        ].join(", ")}`,
      );
    }
    if (centralHttp.length > 0 || centralWs.length > 0) {
      lines.push(
        `${subIndent}- Central routes: ${[
          ...centralHttp.map((r) => `\`${r.route}\``),
          ...centralWs.map((r) => `\`${r.route} (WS)\``),
        ].join(", ")}`,
      );
    }
    return lines;
  },
});
