// Per-plugin builder: Vite programmatic `build()` in lib mode, in-process, one
// Rollup graph per plugin. Reuses today's exact semantics: `@vitejs/plugin-react`
// with the discovered babel contributions, CSS imports (local + npm package CSS,
// injected from JS so styles load atomically with the module), `define`,
// esbuild `keepNames`. NO `@tailwindcss/vite` here — utilities come from the
// single global pass (see `global-css.ts`).

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin as VitePlugin } from "vite";
import { init as esLexerInit, parse as esLexerParse } from "es-module-lexer";
import type { BabelPluginItem } from "@plugins/framework/plugins/web-core/core";
import { makeArtifactExternal } from "../externals";
import { inlinedRootsFor } from "../own-roots";
import { createInlineAudit } from "./inline-audit";
import { hashedRootsFor } from "./own-files";
import type { ArtifactMeta } from "./store";
import { artifactTmpDir, publishArtifact } from "./store";

export interface BuilderCtx {
  repoRoot: string;
  pluginsRoot: string;
  babelPlugins: BabelPluginItem[];
  minify: boolean;
}

export interface ArtifactBuildTarget {
  /** Store dir name (`<slug>.<kind>.<hash16>`). */
  dirName: string;
  /** `web`, `entry`, or a folder-barrel kind (`core`, `fixtures`, …). */
  kind: string;
  /** null for the entry artifact. */
  pluginPath: string | null;
  /** The import-map specifier this artifact will serve (null for entry). */
  specifier: string | null;
  entryFile: string;
  inputsHash: string;
}

// Neither pin is baked into artifacts (either would churn every hash every
// build). `import.meta.env.VITE_BUILD_GRAPH` / `VITE_BUILD_COMMIT` compile to
// the plain global identifiers below, declared by an inline script the compose
// step injects into index.html — so a bundle can name itself while its code
// stays content-addressed.
//
// The graph hash is the bundle's CONTENT identity (a pure function of the
// composed module graph), not the id of the run that produced it: two builds of
// an unchanged tree compose the same graph, so a tab holding it is not stale.
// The commit is the tree the graph was built from.
export const GRAPH_GLOBAL = "__SINGULARITY_GRAPH__";
export const COMMIT_GLOBAL = "__SINGULARITY_COMMIT__";

const ARTIFACT_DEFINE: Record<string, string> = {
  "import.meta.env.DEV": "false",
  "import.meta.env.PROD": "true",
  "import.meta.env.MODE": JSON.stringify("production"),
  "import.meta.env.VITE_BUILD_GRAPH": GRAPH_GLOBAL,
  "import.meta.env.VITE_BUILD_COMMIT": COMMIT_GLOBAL,
  // Vite's APP build replaces this automatically, but LIB mode deliberately
  // preserves it — and `process` does not exist in the browser, so any
  // first-party or inlined npm code branching on NODE_ENV would crash at
  // runtime. Match the monolith (and the vendor esbuild pass, vendors.ts).
  "process.env.NODE_ENV": JSON.stringify("production"),
};

/**
 * Route EVERY import that lands in one of the plugin's own NON-inlined folders
 * through that folder's external `@plugins/<path>/<folder>` barrel — the barrel
 * itself AND deep files (`../core/resource`, `@plugins/<own>/core/x`). One URL =
 * one module instance: inlining any such file next to the artifact everyone
 * else loads would double-instantiate its module state (live-state's descriptor
 * registry and config_v2's descriptor identities were real casualties, and the
 * Layout Lab ran two copies of a plugin's web module for the same reason).
 * It is also what keeps the artifact's address honest: only the inlined roots
 * are hashed, so any other own folder reaching the bytes would fossilise the
 * artifact — see `../own-roots.ts`.
 *
 * Which folders are inlined is `inlinedRootsFor(kind)`, so the rule needs no
 * per-kind special case: building `core` inlines core's internal edges because
 * `core` IS its inlined root, and building `web` never reaches a file under
 * `core/` at all because every entry into it is rewritten here.
 *
 * Named bindings are preserved by the rewrite, so a deep import of a symbol the
 * target barrel does not re-export fails LOUDLY as a missing-export error at
 * load — the fix is to re-export it from the barrel (own symbols consumed
 * across a folder boundary are public API by construction).
 */
function ownFolderBarrelPlugin(
  pluginPath: string,
  pluginDir: string,
  kind: string,
): VitePlugin {
  const inlinedRoots = inlinedRootsFor(kind);
  return {
    name: "web-artifacts:own-folder-barrel",
    enforce: "pre",
    resolveId(id, importer) {
      if (!importer) return null;
      if (id.includes("?")) return null; // vite query suffix — not a source edge to reroute
      if (id.endsWith(".css")) return null; // css stays in-graph (see ../externals.ts)
      // Relative ids resolve against the importer; vite's alias plugin has
      // already rewritten `@plugins/<own>/…` to an absolute path.
      const target =
        id.startsWith("./") || id.startsWith("../")
          ? resolve(dirname(importer), id)
          : isAbsolute(id)
            ? id
            : null;
      if (target === null) return null;
      const rel = relative(pluginDir, target);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null; // outside our tree
      const folder = rel.split(sep)[0]!;
      if (folder === "node_modules") return null; // plugin-local npm deps
      if (folder === "plugins") return null; // sub-plugins are other plugins (external by specifier)
      if (inlinedRoots.includes(folder)) return null;
      if (!existsSync(join(pluginDir, folder, "index.ts"))) {
        throw new Error(
          `web-artifact ${pluginPath} (kind "${kind}"): ${importer} imports "${id}", which ` +
            `lands in the plugin's own "${folder}/" — a folder this artifact neither inlines ` +
            `nor hashes, and which has no ${folder}/index.ts barrel to route the import to. ` +
            `Give it a barrel and import through it, or add "${folder}" to inlinedRootsFor() ` +
            `in core/own-roots.ts.`,
        );
      }
      return { id: `@plugins/${pluginPath}/${folder}`, external: true };
    },
  };
}

/**
 * Entry-artifact only: the global stylesheet import in `main.tsx`
 * (`…/ui-kit/web/theme/app.css`) is satisfied by the compose step's `<link>` to
 * the global Tailwind pass output — strip it to an empty module so it is
 * neither bundled nor externalized as a bogus module URL. Suffix-matched
 * because vite's alias plugin rewrites `@plugins/...` to the absolute path
 * BEFORE `pre` plugins run.
 */
function stripGlobalCssPlugin(): VitePlugin {
  return {
    name: "web-artifacts:strip-global-css",
    enforce: "pre",
    resolveId(id) {
      if (id.endsWith("/ui-kit/web/theme/app.css")) {
        return "\0web-artifacts:global-css-stub";
      }
      return null;
    },
    load(id) {
      if (id === "\0web-artifacts:global-css-stub") return "export {};\n";
      return null;
    },
  };
}

/** Wrap extracted CSS into a JS snippet appended to the module (atomic load). */
function cssInjectionSnippet(css: string, dirName: string): string {
  return (
    `\n;(function(){` +
    `if(typeof document>"u")return;` +
    `var s=document.createElement("style");` +
    `s.setAttribute("data-web-artifact",${JSON.stringify(dirName)});` +
    `s.textContent=${JSON.stringify(css)};` +
    `document.head.appendChild(s);` +
    `})();\n`
  );
}

/**
 * Parse EVERY emitted module's external imports. An artifact with internal
 * dynamic imports (lazy-component) code-splits into `.mjs` chunks next to
 * `index.js` — the chunks' imports are as load-bearing as the entry's (a bare
 * specifier only a lazy chunk imports still needs a vendor + map entry).
 * Statics are recorded PER FILE so the preload BFS walks real static edges and
 * never eagerly preloads a lazy chunk's dependencies.
 */
export async function parseEmittedImports(outDir: string): Promise<{
  staticImportsByFile: Record<string, string[]>;
  dynamicImports: string[];
}> {
  await esLexerInit;
  const staticImportsByFile: Record<string, string[]> = {};
  const dynamicImports = new Set<string>();
  for (const name of readdirSync(outDir).sort()) {
    if (!name.endsWith(".js") && !name.endsWith(".mjs")) continue;
    const code = readFileSync(join(outDir, name), "utf8");
    const [imports] = esLexerParse(code, name);
    const statics = new Set<string>();
    for (const imp of imports) {
      if (imp.n === undefined) continue;
      if (imp.d >= 0) dynamicImports.add(imp.n);
      else if (imp.d === -1) statics.add(imp.n);
    }
    staticImportsByFile[name] = [...statics].sort();
  }
  return {
    staticImportsByFile,
    dynamicImports: [...dynamicImports].sort(),
  };
}

/**
 * Build ONE artifact into the store. Throws on any build error (fail loudly —
 * the pipeline surfaces which plugin failed).
 */
export async function buildArtifact(
  target: ArtifactBuildTarget,
  ctx: BuilderCtx,
): Promise<ArtifactMeta> {
  // Lazy: the vite/babel toolchain (~2s of module eval) must load only when an
  // artifact actually builds, never on plain CLI startup or docgen barrel import.
  const [{ build: viteBuild }, { default: react }] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
  ]);
  const tmpDir = artifactTmpDir(target.dirName);
  // The dir the artifact's own-hash was taken against: the plugin dir for a
  // plugin target, and (for `entry`) web-core's `web/` — which is exactly what
  // `planFleet` passes to `ownHashFor`, so `hashedRootsFor` answers identically
  // for both and the audit checks the roots the address really hashed.
  const pluginDir = target.pluginPath
    ? join(ctx.pluginsRoot, target.pluginPath)
    : dirname(target.entryFile);
  const audit = createInlineAudit({
    dirName: target.dirName,
    hashedRoots: hashedRootsFor(pluginDir, target.kind),
    kind: target.kind,
  });

  const plugins: VitePlugin[] = [audit.plugin];
  if (target.kind === "entry") plugins.push(stripGlobalCssPlugin());
  if (target.pluginPath) {
    plugins.push(
      ownFolderBarrelPlugin(target.pluginPath, pluginDir, target.kind),
    );
  }

  try {
    await viteBuild({
      configFile: false,
      logLevel: "error",
      root: ctx.repoRoot,
      plugins: [...plugins, react({ babel: { plugins: ctx.babelPlugins } })],
      esbuild: { keepNames: true },
      define: ARTIFACT_DEFINE,
      resolve: { alias: { "@plugins": ctx.pluginsRoot } },
      build: {
        lib: {
          entry: target.entryFile,
          formats: ["es"],
          fileName: () => "index.js",
        },
        outDir: tmpDir,
        emptyOutDir: true,
        minify: ctx.minify ? "esbuild" : false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
          external: makeArtifactExternal(target.pluginPath, target.kind),
        },
      },
    });
    // Before anything reads the output: prove the bytes inline only what this
    // artifact's address hashed (see `inline-audit.ts`).
    audit.verify();

    // Fold any extracted CSS (plugin-local + npm package CSS; lib mode inlines
    // url() assets as data URIs) into the module so styles load atomically.
    const cssFiles = readdirSync(tmpDir).filter((f) => f.endsWith(".css"));
    if (cssFiles.length > 0) {
      const css = cssFiles
        .map((f) => readFileSync(join(tmpDir, f), "utf8"))
        .join("\n");
      // Whole-file rewrite (read + concatenate + write), not an append: this is
      // build-artifact ASSEMBLY of a freshly-emitted index.js, not a durable
      // growing log — so it stays on the sanctioned whole-file writer.
      const indexJsPath = join(tmpDir, "index.js");
      const emitted = readFileSync(indexJsPath, "utf8");
      writeFileSync(
        indexJsPath,
        emitted + cssInjectionSnippet(css, target.dirName),
      );
      for (const f of cssFiles) unlinkSync(join(tmpDir, f));
    }

    const indexJs = join(tmpDir, "index.js");
    if (!existsSync(indexJs)) {
      throw new Error(`vite build of ${target.dirName} emitted no index.js`);
    }

    const { staticImportsByFile, dynamicImports } =
      await parseEmittedImports(tmpDir);
    const meta: ArtifactMeta = {
      specifier: target.specifier,
      kind: target.kind,
      pluginPath: target.pluginPath,
      inputsHash: target.inputsHash,
      staticImportsByFile,
      dynamicImports,
      builtAtMs: Date.now(),
    };
    publishArtifact(target.dirName, tmpDir, meta);
    return meta;
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `web-artifact build failed for ${target.dirName} (entry ${target.entryFile}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }
}

/**
 * The registry artifact: `web.generated.ts` type-stripped to plain ESM with its
 * `() => import("@plugins/…/web")` dynamic imports preserved as bare specifiers
 * (the import map resolves them). No bundling — the file has no static imports.
 */
export async function buildRegistryArtifact(opts: {
  dirName: string;
  inputsHash: string;
  registryFile: string;
  minify: boolean;
}): Promise<ArtifactMeta> {
  const { transform } = await import("esbuild");
  const source = readFileSync(opts.registryFile, "utf8");
  const result = await transform(source, {
    loader: "ts",
    format: "esm",
    minify: opts.minify,
    keepNames: true,
    sourcemap: true,
    sourcefile: "web.generated.ts",
  });
  const tmpDir = artifactTmpDir(opts.dirName);
  writeFileSync(
    join(tmpDir, "index.js"),
    result.code + "\n//# sourceMappingURL=index.js.map\n",
  );
  writeFileSync(join(tmpDir, "index.js.map"), result.map);
  const { staticImportsByFile, dynamicImports } =
    await parseEmittedImports(tmpDir);
  const meta: ArtifactMeta = {
    specifier: "@composition-web-registry",
    kind: "registry",
    pluginPath: null,
    inputsHash: opts.inputsHash,
    staticImportsByFile,
    dynamicImports,
    builtAtMs: Date.now(),
  };
  publishArtifact(opts.dirName, tmpDir, meta);
  return meta;
}
