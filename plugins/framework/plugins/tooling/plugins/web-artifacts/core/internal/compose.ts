// Compose step: turn the artifact fleet into a servable dist — the inline
// import map, index.html (preserving web-core's two inline pre-React scripts),
// symlinks from the shared store, the eager-tier modulepreload closure, and the
// hard-fail URL/coverage verification.

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildImportMap, findUnmappedSpecifiers, type ImportMapEntry } from "../import-map";
import { BUILD_ID_GLOBAL } from "./vite-builder";

export interface ComposeOptions {
  stagingDir: string;
  /** web-core/web dir (index.html + public/). */
  webSrcDir: string;
  buildId: string;
  /** Recorded in the marker so map-in-sync recomputes with the dist's own flag. */
  minify: boolean;
  cssHref: string;
  /** dist/artifacts/<linkName> → store dir symlinks. */
  links: Array<{ linkName: string; storePath: string }>;
  /** The full import map (web + core + vendors + registry alias). */
  mapEntries: ImportMapEntry[];
  /** url → emitted STATIC import specifiers (bare or relative) — preload BFS. */
  staticImportsByUrl: Record<string, string[]>;
  /** importer-annotated emitted specifiers (static + dynamic) — coverage check. */
  emitted: Array<{ importer: string; specifiers: string[] }>;
  entryUrl: string;
  /** Seed URLs for the modulepreload closure (entry + registry + eager tier). */
  preloadSeeds: string[];
}

const MAIN_SCRIPT_TAG = '<script type="module" src="/main.tsx"></script>';

/**
 * BFS over static imports from the seed URLs: bare specifiers resolve through
 * the import map; relative specifiers resolve against the importing file's URL.
 * Returns every reachable module URL — the modulepreload set.
 */
export function computePreloadClosure(opts: {
  seeds: string[];
  imports: Record<string, string[]>; // url → emitted static import specifiers
  map: Record<string, string>; // specifier → url
}): string[] {
  const seen = new Set<string>();
  const queue = [...opts.seeds];
  while (queue.length > 0) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    for (const spec of opts.imports[url] ?? []) {
      let next: string | undefined;
      if (spec.startsWith("./") || spec.startsWith("../")) {
        next = new URL(spec, `https://x${url}`).pathname;
      } else {
        next = opts.map[spec];
      }
      if (next !== undefined && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

export function composeDist(
  opts: ComposeOptions,
): { importMap: { imports: Record<string, string> }; preloads: string[] } {
  const { stagingDir } = opts;
  mkdirSync(stagingDir, { recursive: true });

  // 1. Static shell files (icons, …) from web-core's public/.
  const publicDir = join(opts.webSrcDir, "public");
  if (existsSync(publicDir)) {
    cpSync(publicDir, stagingDir, { recursive: true });
  }

  // 2. Import map + coverage verification: every emitted external specifier of
  // every artifact must resolve in the map — a miss would surface at runtime as
  // the SPA fallback serving index.html for a module URL.
  const importMap = buildImportMap(opts.mapEntries);
  const unmapped = findUnmappedSpecifiers(opts.emitted, importMap);
  if (unmapped.length > 0) {
    const lines = unmapped.map((u) => `  ${u.specifier}  (imported by ${u.importer})`);
    throw new Error(
      `compose: ${unmapped.length} emitted import(s) have no import-map entry:\n${lines.join("\n")}`,
    );
  }

  // 3. Symlink artifacts from the shared store.
  const artifactsDir = join(stagingDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  for (const link of opts.links) {
    symlinkSync(link.storePath, join(artifactsDir, link.linkName));
  }

  // 4. Modulepreload closure for the eager tier.
  const preloads = computePreloadClosure({
    seeds: opts.preloadSeeds,
    imports: opts.staticImportsByUrl,
    map: importMap.imports,
  });

  // 5. index.html: keep the source head (theme replay + DevTools-hook inline
  // scripts, icons, title), inject build-id global + import map + global CSS +
  // preloads, and swap the /main.tsx module script for the entry artifact.
  const htmlSrc = readFileSync(join(opts.webSrcDir, "index.html"), "utf8");
  if (!htmlSrc.includes(MAIN_SCRIPT_TAG)) {
    throw new Error(`compose: ${MAIN_SCRIPT_TAG} not found in web-core index.html`);
  }
  if (!htmlSrc.includes("</head>")) {
    throw new Error("compose: </head> not found in web-core index.html");
  }
  const headInject = [
    // `var` in a classic script creates a global binding module code can read —
    // artifacts compile `import.meta.env.VITE_BUILD_ID` to this identifier.
    `<script>var ${BUILD_ID_GLOBAL} = ${JSON.stringify(opts.buildId)}; window.${BUILD_ID_GLOBAL} = ${BUILD_ID_GLOBAL};</script>`,
    `<script type="importmap">${JSON.stringify(importMap)}</script>`,
    `<link rel="stylesheet" href="${opts.cssHref}" />`,
    ...preloads.map((p) => `<link rel="modulepreload" href="${p}" />`),
  ]
    .map((l) => `    ${l}`)
    .join("\n");
  const html = htmlSrc
    .replace("</head>", `${headInject}\n  </head>`)
    .replace(MAIN_SCRIPT_TAG, `<script type="module" src="${opts.entryUrl}"></script>`);
  writeFileSync(join(stagingDir, "index.html"), html);

  // 6. HARD verification: every URL the page will request must resolve to a
  // real file through the staged tree (following the store symlinks).
  const urls = new Set<string>([
    ...Object.values(importMap.imports),
    ...preloads,
    opts.entryUrl,
    opts.cssHref,
  ]);
  const missing: string[] = [];
  for (const url of urls) {
    const file = join(stagingDir, url.replace(/^\//, ""));
    if (!existsSync(file) || !statSync(file).isFile()) missing.push(url);
  }
  if (missing.length > 0) {
    throw new Error(
      `compose: ${missing.length} mapped URL(s) do not resolve to a real file:\n${missing
        .map((m) => `  ${m}`)
        .join("\n")}`,
    );
  }

  // 7. Manifest — doubles as the artifact-mode marker the web-artifacts checks
  // detect a deployed artifact dist by (a monolith dist never contains it).
  writeFileSync(
    join(stagingDir, ".web-artifacts.json"),
    JSON.stringify(
      {
        buildId: opts.buildId,
        minify: opts.minify,
        linkCount: opts.links.length,
        preloadCount: preloads.length,
        importMap,
      },
      null,
      2,
    ),
  );

  return { importMap, preloads };
}
