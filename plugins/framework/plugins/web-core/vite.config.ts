import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { existsSync, readdirSync } from "fs";

// Each `vite/index.ts` contribution returns a Babel plugin. We derive the exact
// item type from `@vitejs/plugin-react`'s own options rather than importing it
// from `@babel/core` directly (its types don't resolve from this file's location,
// though react's bundled `.d.ts` resolves them internally). `Exclude<…, fn>` drops
// the function form of `babel`, leaving the object form whose `plugins` is the
// `PluginItem[]` react ultimately expects.
type ReactBabelObject = Exclude<
  NonNullable<NonNullable<Parameters<typeof react>[0]>["babel"]>,
  (...args: never[]) => unknown
>;
type BabelPluginItem = NonNullable<ReactBabelObject["plugins"]>[number];

// A contribution's default export may return EITHER a bare `BabelPluginItem`
// (back-compat) OR an ordered wrapper `{ order?: number; plugin }`. The numeric
// `order` is the ONLY ordering knob the consumer reads — it never names an
// individual contributor (collection-consumer separation). Lower `order` runs
// FIRST in Babel's plugin list; a bare return normalizes to `order: 0`.
// Convention: reserve a low value like `-100` for "must run first" transforms
// (e.g. a whole-program compiler that other JSX-stamping transforms must follow).
type OrderedBabelContribution = { order?: number; plugin: BabelPluginItem };
type ViteContributionReturn = BabelPluginItem | OrderedBabelContribution;

// Robustly discriminate the ordered wrapper from a bare `BabelPluginItem`. A bare
// item can be a string, a function, a tuple `[plugin, options]` (array), or a
// plugin object `{ name, visitor }`. The wrapper is the only non-array object that
// carries a `plugin` key — a plugin object has `name`/`visitor` but no `plugin`,
// so it correctly falls through to the bare branch.
function isOrderedContribution(
  ret: ViteContributionReturn,
): ret is OrderedBabelContribution {
  return (
    typeof ret === "object" &&
    ret !== null &&
    !Array.isArray(ret) &&
    "plugin" in ret
  );
}

// Discover every plugin's `vite/index.ts` build contribution generically — never
// naming an individual contributor (collection-consumer separation). Each such
// module default-exports a factory `({ repoRoot }) => babelPlugin`; the results
// are handed to `@vitejs/plugin-react`'s `babel.plugins`. Presence of a `vite/`
// folder == presence of its transform: drop the contributing plugin and the walk
// finds nothing.
//
// We use a plain `readdirSync` walk (the same pattern as
// `plugin-registry-gen.ts`) rather than `fs/promises.glob` to avoid that API's
// Node-version floor. Contributions are imported by ABSOLUTE path, so the
// `@plugins` alias (which the esbuild config loader does not resolve) is never
// needed.
function findViteContributions(pluginsRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > 12) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "EACCES" && code !== "ENOTDIR") throw err;
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith("dist.")) {
        continue;
      }
      if (e.name === "vite") {
        const index = path.join(dir, e.name, "index.ts");
        if (existsSync(index)) out.push(index);
        continue;
      }
      walk(path.join(dir, e.name), depth + 1);
    }
  }
  walk(pluginsRoot, 0);
  return out;
}

export default defineConfig(async () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const pluginsRoot = path.resolve(__dirname, "../../../");
  const webSdkCore = path.resolve(__dirname, "../web-sdk/core");

  // Collect every contribution as a normalized `{ order, plugin }` record, then
  // STABLE-sort ascending by `order` so the final Babel plugin list is
  // deterministic regardless of filesystem discovery order. The discovery walk
  // (`findViteContributions`) yields filesystem order; without this sort, ordering
  // would be incidental — which breaks transforms that REQUIRE a relative position
  // (e.g. a whole-program compiler that must precede JSX-stamping transforms).
  // `Array.prototype.sort` is stable in modern V8/Bun, so contributions sharing an
  // `order` keep their discovery order.
  const ordered: { order: number; plugin: BabelPluginItem }[] = [];
  for (const file of findViteContributions(pluginsRoot)) {
    const mod = (await import(file)) as {
      default: (opts: { repoRoot: string }) => ViteContributionReturn;
    };
    const ret = mod.default({ repoRoot });
    ordered.push(
      isOrderedContribution(ret)
        ? { order: ret.order ?? 0, plugin: ret.plugin }
        : { order: 0, plugin: ret },
    );
  }
  ordered.sort((a, b) => a.order - b.order);
  const babelPlugins: BabelPluginItem[] = ordered.map((o) => o.plugin);

  return {
    root: path.resolve(__dirname, "./web"),
    plugins: [react({ babel: { plugins: babelPlugins } }), tailwindcss()],
    // Preserve function/class `.name` through minification so debugging,
    // profiling (the render-profiler reads component names off fibers), crash
    // reports, and stack traces show real component names, not mangled `n`/`t`.
    esbuild: { keepNames: true },
    define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(process.env.VITE_BUILD_ID ?? "dev") },
    // `server:` is NOT added on purpose.
    // /api and /ws proxying is handled by the gateway, NOT Vite.
    build: {
      outDir: path.resolve(__dirname, process.env.VITE_OUT_DIR || "dist"),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        "@plugins": path.resolve(__dirname, "../../../"),
        // Composition build-gating: select the full vs. filtered plugin registry
        // at the IMPORT SEAM via a build-time alias branch — NOT a runtime
        // `import.meta.env` ternary. A runtime ternary would make Rollup bundle
        // BOTH registries and ship all ~540 plugins (silent failure). The
        // filtered file is gitignored and only exists after a `--composition`
        // build; with no VITE_COMPOSITION we resolve the committed full registry,
        // so a plain build stays byte-identical.
        "@composition-web-registry": process.env.VITE_COMPOSITION
          ? path.join(webSdkCore, "web.composition.generated.ts")
          : path.join(webSdkCore, "web.generated.ts"),
      },
    },
  };
});
