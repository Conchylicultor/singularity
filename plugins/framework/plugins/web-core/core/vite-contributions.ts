// Shared discovery + loading of per-plugin `vite/index.ts` build contributions
// (Babel plugins handed to `@vitejs/plugin-react`). Extracted from
// `web-core/vite.config.ts` so the per-plugin artifact builder
// (`tooling/web-artifacts`) reuses the EXACT same transform set as the
// monolithic build — one discovery walk, one ordering rule, zero duplication.
//
// `vite.config.ts` imports this file RELATIVELY (its esbuild config loader
// cannot resolve the `@plugins` alias); other plugins import it through the
// `@plugins/framework/plugins/web-core/core` barrel.

import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import type react from "@vitejs/plugin-react";

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
export type BabelPluginItem = NonNullable<ReactBabelObject["plugins"]>[number];

// A contribution's default export may return EITHER a bare `BabelPluginItem`
// (back-compat) OR an ordered wrapper `{ order?: number; plugin }`. The numeric
// `order` is the ONLY ordering knob the consumer reads — it never names an
// individual contributor (collection-consumer separation). Lower `order` runs
// FIRST in Babel's plugin list; a bare return normalizes to `order: 0`.
// Convention: reserve a low value like `-100` for "must run first" transforms
// (e.g. a whole-program compiler that other JSX-stamping transforms must follow).
export type OrderedBabelContribution = { order?: number; plugin: BabelPluginItem };
export type ViteContributionReturn = BabelPluginItem | OrderedBabelContribution;

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

/**
 * Discover every plugin's `vite/index.ts` build contribution generically — never
 * naming an individual contributor (collection-consumer separation). Each such
 * module default-exports a factory `({ repoRoot }) => babelPlugin`. Presence of
 * a `vite/` folder == presence of its transform: drop the contributing plugin
 * and the walk finds nothing. Returned paths are sorted for determinism.
 *
 * Plain `readdirSync` walk (the same pattern as `plugin-registry-gen.ts`) rather
 * than `fs/promises.glob` to avoid that API's Node-version floor.
 */
export function findViteContributions(pluginsRoot: string): string[] {
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
  out.sort();
  return out;
}

/**
 * Load every discovered contribution and return the final ordered Babel plugin
 * list. Collects each contribution as a normalized `{ order, plugin }` record,
 * then STABLE-sorts ascending by `order` so the list is deterministic regardless
 * of filesystem discovery order — ordering is load-bearing for transforms that
 * REQUIRE a relative position (e.g. a whole-program compiler that must precede
 * JSX-stamping transforms). Contributions are imported by ABSOLUTE path, so the
 * `@plugins` alias (which the esbuild config loader does not resolve) is never
 * needed.
 */
export async function loadBabelContributions(opts: {
  pluginsRoot: string;
  repoRoot: string;
}): Promise<BabelPluginItem[]> {
  const ordered: { order: number; plugin: BabelPluginItem }[] = [];
  for (const file of findViteContributions(opts.pluginsRoot)) {
    const mod = (await import(file)) as {
      default: (o: { repoRoot: string }) => ViteContributionReturn;
    };
    const ret = mod.default({ repoRoot: opts.repoRoot });
    ordered.push(
      isOrderedContribution(ret)
        ? { order: ret.order ?? 0, plugin: ret.plugin }
        : { order: 0, plugin: ret },
    );
  }
  ordered.sort((a, b) => a.order - b.order);
  return ordered.map((o) => o.plugin);
}
