// Per-plugin builder: Vite programmatic `build()` in lib mode, in-process, one
// Rollup graph per plugin. Reuses today's exact semantics: `@vitejs/plugin-react`
// with the discovered babel contributions, CSS imports (local + npm package CSS,
// injected from JS so styles load atomically with the module), `define`,
// esbuild `keepNames`. NO `@tailwindcss/vite` here — utilities come from the
// single global pass (see `global-css.ts`).

import { existsSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Plugin as VitePlugin } from "vite";
import { init as esLexerInit, parse as esLexerParse } from "es-module-lexer";
import type { BabelPluginItem } from "@plugins/framework/plugins/web-core/core";
import { makeArtifactExternal } from "../externals";
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

// The build-id is NOT baked into artifacts (it would churn every hash every
// build). `import.meta.env.VITE_BUILD_ID` compiles to the plain global
// identifier below, declared by an inline script the compose step injects into
// index.html — so the stale-tab hook keeps working with content-addressed code.
export const BUILD_ID_GLOBAL = "__SINGULARITY_BUILD_ID__";

const ARTIFACT_DEFINE: Record<string, string> = {
  "import.meta.env.DEV": "false",
  "import.meta.env.PROD": "true",
  "import.meta.env.MODE": JSON.stringify("production"),
  "import.meta.env.VITE_BUILD_ID": BUILD_ID_GLOBAL,
  // Vite's APP build replaces this automatically, but LIB mode deliberately
  // preserves it — and `process` does not exist in the browser, so any
  // first-party or inlined npm code branching on NODE_ENV would crash at
  // runtime. Match the monolith (and the vendor esbuild pass, vendors.ts).
  "process.env.NODE_ENV": JSON.stringify("production"),
};

/**
 * Route EVERY own-core import of the plugin's web/shared code through the
 * external `@plugins/<path>/core` barrel — the barrel itself AND deep files
 * (`../core/resource`, `@plugins/<own>/core/x`). One URL = one module instance:
 * inlining any core file into the web artifact next to the shared core artifact
 * would double-instantiate its module state (live-state's descriptor registry
 * and config_v2's descriptor identities were real casualties). Named bindings
 * are preserved by the rewrite, so a deep import of a symbol the core barrel
 * does not re-export fails LOUDLY as a missing-export error at load — the fix
 * is to re-export it from the barrel (own-core symbols consumed by the
 * plugin's web surface are public API by construction).
 *
 * Imports BETWEEN core files are exempt: in a web build no core file is ever
 * reached (all entries into core/ are rewritten), and in the plugin's own core
 * artifact build they are exactly the module graph being bundled.
 */
function ownCoreBarrelPlugin(pluginPath: string, pluginDir: string): VitePlugin {
  const coreBarrel = resolve(pluginDir, "core", "index.ts");
  const coreDir = resolve(pluginDir, "core");
  const specifier = `@plugins/${pluginPath}/core`;
  return {
    name: "web-artifacts:own-core-barrel",
    enforce: "pre",
    resolveId(id, importer) {
      if (!importer || !existsSync(coreBarrel)) return null;
      if (importer.startsWith(coreDir + "/")) return null; // inside core: keep internal edges
      // Relative ids resolve against the importer; vite's alias plugin has
      // already rewritten `@plugins/<own>/core/…` to an absolute path.
      let target: string | null = null;
      if (id.startsWith("./") || id.startsWith("../")) {
        target = resolve(dirname(importer), id);
      } else if (id.startsWith(coreDir + "/") || id === coreDir) {
        target = id;
      }
      if (target === null) return null;
      if (target === coreDir || target.startsWith(coreDir + "/")) {
        return { id: specifier, external: true };
      }
      return null;
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
export async function parseEmittedImports(
  outDir: string,
): Promise<{ staticImportsByFile: Record<string, string[]>; dynamicImports: string[] }> {
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
  const pluginDir = target.pluginPath ? join(ctx.pluginsRoot, target.pluginPath) : null;

  const plugins: VitePlugin[] = [];
  if (target.kind === "entry") plugins.push(stripGlobalCssPlugin());
  if (target.pluginPath && pluginDir) plugins.push(ownCoreBarrelPlugin(target.pluginPath, pluginDir));

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
        lib: { entry: target.entryFile, formats: ["es"], fileName: () => "index.js" },
        outDir: tmpDir,
        emptyOutDir: true,
        minify: ctx.minify ? "esbuild" : false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: { external: makeArtifactExternal(target.pluginPath) },
      },
    });

    // Fold any extracted CSS (plugin-local + npm package CSS; lib mode inlines
    // url() assets as data URIs) into the module so styles load atomically.
    const cssFiles = readdirSync(tmpDir).filter((f) => f.endsWith(".css"));
    if (cssFiles.length > 0) {
      const css = cssFiles.map((f) => readFileSync(join(tmpDir, f), "utf8")).join("\n");
      appendFileSync(join(tmpDir, "index.js"), cssInjectionSnippet(css, target.dirName));
      for (const f of cssFiles) unlinkSync(join(tmpDir, f));
    }

    const indexJs = join(tmpDir, "index.js");
    if (!existsSync(indexJs)) {
      throw new Error(`vite build of ${target.dirName} emitted no index.js`);
    }

    const { staticImportsByFile, dynamicImports } = await parseEmittedImports(tmpDir);
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
  writeFileSync(join(tmpDir, "index.js"), result.code + "\n//# sourceMappingURL=index.js.map\n");
  writeFileSync(join(tmpDir, "index.js.map"), result.map);
  const { staticImportsByFile, dynamicImports } = await parseEmittedImports(tmpDir);
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
