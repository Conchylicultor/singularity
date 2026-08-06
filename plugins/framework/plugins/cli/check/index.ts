import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { Check } from "@plugins/framework/plugins/tooling/core";

const BUILD = "plugins/framework/plugins/cli/bin/commands/build.ts";
const BUILD_COMPOSITION = "plugins/framework/plugins/cli/bin/commands/build-composition.ts";
const BOOTSTRAP = "plugins/framework/plugins/cli/bin/index.ts";
const CLI_BODY = "plugins/framework/plugins/cli/bin/cli.ts";
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

interface ImportClosure {
  /** The REPO source modules the entrypoint pulls in, as repo-relative paths. */
  modules: Set<string>;
  /**
   * Every specifier that resolved OUTSIDE the repo tree — i.e. every non-relative,
   * non-alias specifier the `externalize-packages` plugin below declared external
   * — mapped to the repo-relative importers that asked for it.
   *
   * Node/Bun builtins (`node:*`, `bun`, `bun:*`, and the unprefixed builtin
   * names) do NOT appear: Bun resolves those itself, ahead of build plugins, so
   * `onResolve` never sees them. The bootstrap check below still classifies them
   * explicitly rather than relying on that — its invariant is "resolvable with no
   * `node_modules`", and it must not silently invert if Bun ever starts routing
   * builtins through plugins.
   */
  external: Map<string, string[]>;
}

interface ClosureOptions {
  /**
   * Treat an `import()` edge as a traversal BOUNDARY: the specifier is neither
   * followed nor recorded in `external`.
   *
   * Off by default, which is what the subset check wants — it measures everything
   * that can be *reached*, dynamically or not. The bootstrap check wants the
   * opposite, because its subject is the HOISTING rule specifically: only the
   * static graph is resolved before the entrypoint's first statement runs, so a
   * dynamic edge is exactly where "must resolve pre-install" stops applying. It is
   * also the edge `bin/index.ts` deliberately uses to reach `cli.ts` after the
   * install, whose npm closure would otherwise be reported against it.
   */
  stopAtDynamicImport?: boolean;
}

/**
 * The exact set of REPO source modules an entrypoint pulls in (plus the
 * out-of-tree specifiers it reaches for), as repo-relative paths.
 *
 * Measured with `Bun.build` rather than a hand-rolled scanner + resolver: the
 * bundler computes the closure by construction and resolves `@plugins/*` through
 * the on-disk tsconfig exactly as the runtime does, so the answer cannot drift
 * from what actually loads. The module list is read back off the bundle's own
 * external sourcemap (`sources`), which is the bundler's own record of what it
 * pulled in.
 *
 * npm packages are marked external and therefore absent from `modules`. For the
 * subset check that is the right scope, not a limitation: its invariant is about
 * plugin BARRELS, an npm package can never be one, and bundling `node_modules`
 * for real both fails (playwright's optional peer deps are not installed) and
 * would make the check a package-resolution test. The bootstrap check needs the
 * opposite half of the same measurement, which is why `external` is returned
 * alongside: the set the resolver declared external IS the answer to "what does
 * this entrypoint need `node_modules` for", with no second scanner to keep in
 * sync.
 */
async function importClosure(
  root: string,
  entry: string,
  opts: ClosureOptions = {},
): Promise<ImportClosure> {
  const { prefixes, exact } = aliasSpecifiers(root);
  const external = new Map<string, string[]>();
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
              // Cut the graph here, whatever the specifier resolves to.
              if (opts.stopAtDynamicImport === true && args.kind === "dynamic-import") {
                return { path: spec, external: true };
              }
              // Relative / absolute → repo source; let Bun resolve it.
              if (spec.startsWith(".") || spec.startsWith("/")) return undefined;
              // A declared tsconfig alias → repo source; let Bun resolve it.
              if (prefixes.some((p) => spec.startsWith(p)) || exact.includes(spec)) {
                return undefined;
              }
              const importer = args.importer === "" ? entry : relative(root, args.importer);
              const importers = external.get(spec);
              if (importers === undefined) external.set(spec, [importer]);
              else if (!importers.includes(importer)) importers.push(importer);
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
    const modules = new Set(sources.map((s) => relative(root, resolve(out, s))));
    // An entrypoint always contributes at least itself, so an empty module set is
    // never a legitimately-empty measurement — it means the sourcemap was read
    // wrong (or Bun changed its shape) and BOTH checks below would then compare
    // nothing and pass. Fail loudly instead of absorbing it as a green.
    if (modules.size === 0) {
      throw new Error(
        `Bun.build reported an EMPTY module closure for ${entry}. An entrypoint always contributes ` +
          `itself, so this is a broken measurement (sourcemap shape changed?), not an entrypoint ` +
          `with no modules — refusing to report a pass derived from it.`,
      );
    }
    return { modules, external };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * The builtin names legally importable WITHOUT the `node:` prefix, from the
 * runtime's own list rather than a hardcoded copy, so a new Node release's module
 * never reads as an npm package. Deliberately excludes the `node:`-only entries
 * (`node:test`, `node:sqlite`, …): those are covered by the prefix rule below,
 * and stripping their prefix here would make a bare `import "test"` — a real npm
 * package name — look like a builtin.
 */
const BARE_BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("node:")));

/**
 * Resolvable with `node_modules` ABSENT: Bun/Node builtins are compiled into the
 * runtime. Everything else non-relative and non-aliased is an installed package.
 */
function resolvesWithoutNodeModules(spec: string): boolean {
  if (spec.startsWith("node:") || spec === "bun" || spec.startsWith("bun:")) return true;
  return BARE_BUILTINS.has(spec);
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
    const [{ modules: buildModules }, { modules: compositionModules }] = await Promise.all([
      importClosure(root, BUILD),
      importClosure(root, BUILD_COMPOSITION),
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

/**
 * `bin/index.ts` — the CLI's bootstrap — must reach NO npm package through its
 * static import closure.
 *
 * WHY, precisely: `bin/index.ts` is the process that RUNS `bun install`. It arms
 * the orphan guard, `await ensureDeps()`, and only then `await import("./cli.ts")`.
 * Static imports hoist above all of that — an ES module's entire dependency graph
 * is resolved and evaluated BEFORE its first statement executes. So one
 * `import { program } from "commander"` at the top of `bin/index.ts` means a
 * checkout with no `node_modules` dies on an unresolved module before a single
 * line of the bootstrap runs. The CLI can no longer install its own dependencies,
 * and the failure is exactly the shape this whole design exists to eliminate: a
 * pre-CLI death with no subcommand to attribute it to (`./singularity check` →
 * exit 1, and the module error names `commander`, not "your deps are missing").
 * `rm -rf node_modules && ./singularity build` is then unrecoverable from inside
 * the repo, which is also the fresh-clone path.
 *
 * That is the entire reason the bootstrap / `cli.ts` split exists: today's
 * commander program lives in `bin/cli.ts` precisely so it is reached by a
 * DYNAMIC import, evaluated after the install. Nothing marks `bin/index.ts` as
 * special at the language level, so the split survives only as long as something
 * measures it — the next edit that "just adds an import at the top" silently
 * undoes it.
 *
 * NOT THE WHOLE STORY, and this check must not be read as saying it is. Passing
 * here means nothing resolves BEFORE the install; it says nothing about whether
 * what resolves after it can be found. Bun's resolver caches directory listings,
 * so the installing process cannot see its own `node_modules` — a green check
 * here still ended in `Cannot find package 'commander'` on every fresh checkout
 * until `bin/index.ts` started re-execing after an install. Ordering and process
 * identity are two separate requirements; this check measures the first.
 * `bin/reexec.ts` owns the second.
 *
 * Measured off the same `Bun.build` closure as the check above, from the opposite
 * side: the set of specifiers the resolver declared external IS the set the
 * entrypoint needs `node_modules` for. No independent scanner, and the alias
 * prefixes come from `tsconfig.base.json`, so a new alias cannot turn a repo
 * subtree into a false "npm package" (nor the reverse).
 *
 * Measured with `stopAtDynamicImport`, which is the whole subtlety. The hazard is
 * HOISTING, so the subject is the static graph only: `bin/index.ts`'s deliberate
 * `await import("./cli.ts")` is a literal specifier the bundler happily follows,
 * and following it would drag `cli.ts`'s entire npm closure (commander, pg, …)
 * into this check's numbers and fail it permanently — while proving nothing, since
 * those packages resolve when that `import()` executes, i.e. after `ensureDeps()`.
 * Cutting the graph at every `import()` edge measures exactly the set that is
 * resolved before the bootstrap's first statement.
 *
 * KNOWN LIMIT, stated rather than papered over: static measurement cannot see an
 * `import()` whose specifier is computed at runtime — nor, by the paragraph above,
 * does this check look inside any dynamic edge at all. So a package reached only
 * that way passes. That is a deliberate scope, not a hole: a dynamic import does
 * not hoist, so it cannot resolve before `ensureDeps()` has run, which is the one
 * failure mode this check exists to prevent. What it does NOT cover is a dynamic
 * import placed *ahead* of `ensureDeps()` in the bootstrap's own control flow —
 * a shape a reader of that deliberately-tiny file can see at a glance, and which
 * no static import-graph measurement can distinguish from a correctly-placed one.
 */
const bootstrapPackageFreeCheck: Check = {
  id: "cli:bootstrap-package-free",
  description:
    "the CLI bootstrap (bin/index.ts) must statically import no npm package — it is the process that RUNS bun install, so its import closure has to resolve with node_modules absent",
  async run() {
    const root = await getWorktreeRoot();
    const { external } = await importClosure(root, BOOTSTRAP, { stopAtDynamicImport: true });

    const offenders = [...external]
      .filter(([spec]) => !resolvesWithoutNodeModules(spec))
      .map(([spec, importers]) => `${spec}  (imported by ${importers.sort().join(", ")})`)
      .sort();
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${BOOTSTRAP} statically reaches ${offenders.length} specifier(s) that do not resolve ` +
        `without node_modules:\n    ` +
        offenders.join("\n    "),
      hint:
        `Move the import into ${CLI_BODY}, which ${BOOTSTRAP} reaches through a dynamic ` +
        `await import() AFTER ensureDeps() has installed. ${BOOTSTRAP} runs BEFORE bun install, and ` +
        "static imports hoist above every statement in it — so anything it statically imports must " +
        "resolve with node_modules absent: node builtins, relative repo files, and declared " +
        "@plugins/* aliases only. One npm import here turns a fresh checkout (or any `rm -rf " +
        "node_modules`) into an unresolved-module crash before the CLI can install its own " +
        "dependencies.",
    };
  },
};

export default [importSubsetCheck, bootstrapPackageFreeCheck];
