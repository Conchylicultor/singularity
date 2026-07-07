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
  markerCallSpans,
  walkFiles,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type RouteDef, type RoutesData, routesFacetDef } from "../core";

export default createFacet<RoutesData>({
  def: routesFacetDef,

  extract(ctx) {
    const routes: RouteDef[] = [];

    // ── HTTP routes: collect defineEndpoint({ route: "..." }) from the two
    //    runtimes an endpoint can live in. Endpoints must be importable from
    //    both web and server, so they sit in `core/` (when imported
    //    cross-plugin) or `shared/` (plugin-private web+server). Scan both, or
    //    `[endpoint.route]` computed keys whose definition lives in `shared/`
    //    (e.g. notifications, crashes) get silently dropped.
    const endpointFiles: string[] = [];
    walkFiles(join(ctx.dir, "core"), endpointFiles);
    walkFiles(join(ctx.dir, "shared"), endpointFiles);

    const endpointRoutes = new Map<string, string>(); // exportName → routeString
    for (const file of endpointFiles) {
      if (!file.endsWith(".ts")) continue;
      const raw = readIfExists(file);
      if (!raw) continue;
      const src = stripTypes(raw);
      // FULL-mask so a `defineEndpoint(` written inside a comment, string, or
      // template literal can't register a phantom route. Genuine calls are
      // located over the mask; the export name and the call body are read back
      // from the ORIGINAL by offset (the mask preserves offsets 1:1) — the
      // sanctioned marker contract, not a raw-source `const X = defineEndpoint(`
      // regex.
      const masked = maskSource(src);
      for (const span of markerCallSpans(masked, "defineEndpoint")) {
        // `export const <name> = ` immediately before the call identifier.
        const decl = /export\s+const\s+(\w+)\s*=\s*$/.exec(masked.slice(0, span.identifier));
        if (!decl) continue;
        const body = src.slice(span.open + 1, span.close);
        const routeMatch = /route\s*:\s*"([^"]+)"/.exec(body);
        if (routeMatch) endpointRoutes.set(decl[1]!, routeMatch[1]!);
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
        // Skip test/fixture files: an `/api/<prefix>` inside a fixture string is
        // not a real caller, and (unlike a marker-value scan) full masking can't
        // exclude it since the URL genuinely lives in a string — so drop the
        // fixture leg of the false positive by path.
        if (/\.test\.tsx?$/.test(f) || f.includes("/__tests__/")) continue;
        const raw = readIfExists(f);
        if (!raw) continue;
        // Sanctioned token-in-string scan: the `/api/<prefix>` URL lives inside
        // caller string literals (passed to fetch) with NO enclosing marker
        // call, so masking fully would erase it. We mask comments/regex but KEEP
        // strings so a commented or documented `/api/<prefix>` doesn't register a
        // phantom caller. Allowlisted in `no-adhoc-marker-scan`.
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
