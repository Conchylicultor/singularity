import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { Check } from "@plugins/framework/plugins/tooling/core";

const BUILD = "plugins/framework/plugins/cli/bin/commands/build.ts";
const BUILD_COMPOSITION = "plugins/framework/plugins/cli/bin/commands/build-composition.ts";
const TSCONFIG_BASE = "tsconfig.base.json";

/**
 * Every path-alias prefix declared in the repo's single alias owner
 * (`tsconfig.base.json` — guaranteed to be the only owner by the
 * `tsconfig-alias-single-owner` check). Derived rather than hardcoded so a new
 * alias never silently becomes an "external package" below and drops a whole
 * subtree out of the measured closure.
 */
function aliasSpecifiers(root: string): { prefixes: string[]; exact: string[] } {
  const raw = readFileSync(join(root, TSCONFIG_BASE), "utf8");
  const paths = (JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } })
    .compilerOptions?.paths;
  if (!paths || Object.keys(paths).length === 0) {
    throw new Error(
      `${TSCONFIG_BASE} declares no path aliases — it is the repo's single alias owner, so this is not a legitimately empty result.`,
    );
  }
  const prefixes: string[] = [];
  const exact: string[] = [];
  for (const key of Object.keys(paths)) {
    if (key.endsWith("*")) prefixes.push(key.slice(0, -1));
    else exact.push(key);
  }
  return { prefixes, exact };
}

/**
 * The exact set of REPO source modules an entrypoint pulls in, as repo-relative
 * paths.
 *
 * Measured with `Bun.build` rather than a hand-rolled scanner + resolver: the
 * bundler computes the closure by construction and resolves `@plugins/*` through
 * the on-disk tsconfig exactly as the runtime does, so the answer cannot drift
 * from what actually loads. The module list is read back off the bundle's own
 * external sourcemap (`sources`), which is the bundler's own record of what it
 * pulled in.
 *
 * npm packages are marked external and therefore absent from the result. That is
 * the right scope, not a limitation: the invariant below is about plugin
 * BARRELS, an npm package can never be one, and bundling `node_modules` for real
 * both fails (playwright's optional peer deps are not installed) and would make
 * the check a package-resolution test.
 */
async function repoClosure(root: string, entry: string): Promise<Set<string>> {
  const { prefixes, exact } = aliasSpecifiers(root);
  const out = mkdtempSync(join(tmpdir(), "cli-import-closure-"));
  try {
    const result = await Bun.build({
      entrypoints: [join(root, entry)],
      outdir: out,
      target: "bun",
      sourcemap: "external",
      plugins: [
        {
          name: "externalize-packages",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              const spec = args.path;
              // Relative / absolute → repo source; let Bun resolve it.
              if (spec.startsWith(".") || spec.startsWith("/")) return undefined;
              // A declared tsconfig alias → repo source; let Bun resolve it.
              if (prefixes.some((p) => spec.startsWith(p)) || exact.includes(spec)) {
                return undefined;
              }
              return { path: spec, external: true };
            });
          },
        },
      ],
    });
    if (!result.success) {
      throw new Error(
        `Bun.build could not compute the import closure of ${entry}:\n` +
          result.logs.map((l) => `  ${String(l)}`).join("\n"),
      );
    }
    const mapFile = readdirSync(out).find((f) => f.endsWith(".map"));
    if (mapFile === undefined) {
      throw new Error(
        `Bun.build produced no external sourcemap for ${entry}, so the module list is unavailable.`,
      );
    }
    const sources = (
      JSON.parse(readFileSync(join(out, mapFile), "utf8")) as { sources: string[] }
    ).sources;
    // Sourcemap `sources` are relative to the map file; re-root them on the repo.
    return new Set(sources.map((s) => relative(root, resolve(out, s))));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * `build-composition` (the hermetic artifact half of `build`, and the phase
 * `release` shells into) must never reach a module `build` does not already
 * reach.
 *
 * WHY, precisely — this is a correctness invariant, not tidiness. Bun's ESM
 * cache freezes a module on its first `import()`, and a later disk write cannot
 * invalidate it. Stage 2 of the shared pipeline (`generateAppSources` →
 * `regenerateManifestCodegen`) arms `setPreBarrelImportGuard` BEFORE the first
 * plugin-barrel import; that only works in a process which has not already
 * imported a barrel. In a pre-frozen process the guard never fires,
 * `generateConfigOrigins` re-imports stale barrels, and
 * `pruneOrphanedConfigFiles` DELETES a freshly-authored config override —
 * silent data loss, with no failing step to point at.
 *
 * `build.ts` has that property today. Keeping `build-composition.ts`'s module
 * set a SUBSET makes the property INHERITED rather than independently
 * re-derived — one thing to keep true instead of two. (It is also why
 * `release.ts`, which statically imports plugin barrels at module load, shells
 * out to a fresh process instead of calling the pipeline in-process.)
 *
 * KNOWN LIMIT, stated rather than papered over: this measures the STATICALLY
 * reachable closure (static imports plus `import("<literal>")`). An `import()`
 * whose specifier is computed at runtime is invisible to the bundler — as it is
 * to every other static tool — so a barrel reached only that way would pass.
 * That shape is rare and already discouraged; the check covers the mechanism
 * that actually caused the bug.
 *
 * Deliberately a MODULE-SET comparison, not a grep for named forbidden symbols:
 * the shared module's own docblock legitimately NAMES the dev-only steps it
 * excludes (`waitForPg`, `writeWorktreeSpec`, …), so any text scan false-positives
 * on the documentation of the very invariant it is checking. The import set is
 * the mechanical property; prose is not.
 */
const importSubsetCheck: Check = {
  id: "cli:build-composition-import-subset",
  description:
    "build-composition.ts's transitive repo-module set must be a subset of build.ts's — the ESM-freeze / pre-barrel-guard property is inherited from build, never re-derived",
  async run() {
    const root = await getWorktreeRoot();
    const [buildModules, compositionModules] = await Promise.all([
      repoClosure(root, BUILD),
      repoClosure(root, BUILD_COMPOSITION),
    ]);

    const extra = [...compositionModules]
      .filter((m) => m !== BUILD_COMPOSITION && !buildModules.has(m))
      .sort();
    if (extra.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${BUILD_COMPOSITION} imports ${extra.length} module(s) that ${BUILD} does not:\n    ` +
        extra.join("\n    "),
      hint:
        "Either route the new dependency through a module build.ts already imports (usually " +
        "commands/internal/app-artifacts.ts, which both commands drive), or add the same import to " +
        "build.ts — deliberately, after checking it cannot reach a plugin barrel at module-eval time. " +
        "A module build.ts does not import can be evaluated before stage 2 arms setPreBarrelImportGuard, " +
        "and a frozen barrel there makes pruneOrphanedConfigFiles delete a freshly-authored config " +
        "override. See the docblocks in build-composition.ts and commands/internal/app-artifacts.ts.",
    };
  },
};

export default importSubsetCheck;
