import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  postWebManifests,
  preBarrelManifests,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import { isCliCommand, type CliCommand } from "../core";

const BOOTSTRAP = "plugins/framework/plugins/cli/bin/index.ts";
/**
 * The same file as {@link BOOTSTRAP}, named for the OTHER subject it serves.
 * The two checks below measure this one entrypoint with opposite dynamic-edge
 * policies, and the names say which question is being asked: `BOOTSTRAP` is the
 * pre-install HOISTING subject (dynamic edges cut), `CLI_ENTRY` is the whole CLI
 * PROCESS (dynamic edges followed, so `await import("./cli")` is traversed).
 */
const CLI_ENTRY = BOOTSTRAP;
const CLI_BODY = "plugins/framework/plugins/cli/bin/cli.ts";
const TSCONFIG_BASE = "tsconfig.base.json";

/**
 * Every path-alias prefix declared in the repo's single alias owner
 * (`tsconfig.base.json` — guaranteed to be the only owner by the
 * `tsconfig-alias-single-owner` check). Derived rather than hardcoded so a new
 * alias never silently becomes an "external package" below and drops a whole
 * subtree out of the measured closure.
 */
function aliasSpecifiers(root: string): {
  prefixes: string[];
  exact: string[];
} {
  const raw = readFileSync(join(root, TSCONFIG_BASE), "utf8");
  const paths = (
    JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } }
  ).compilerOptions?.paths;
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
   * Off by default, which is what the manifest-freeze check wants — its subject is
   * the whole PROCESS, so it measures everything that can be *reached*,
   * dynamically or not (including `bin/index.ts`'s own `await import("./cli")`). The bootstrap check wants the
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
 * manifest-freeze check that is the right scope, not a limitation: its invariant
 * is about REPO-GENERATED files, an npm package can never be one, and bundling
 * `node_modules` for real both fails (playwright's optional peer deps are not
 * installed) and would make the check a package-resolution test. The bootstrap
 * check needs the opposite half of the same measurement, which is why `external`
 * is returned alongside: the set the resolver declared external IS the answer to
 * "what does this entrypoint need `node_modules` for", with no second scanner to
 * keep in sync.
 *
 * The module list is read off the SINGLE emitted `.map`, which is a complete
 * reading only because `splitting` is off (the default): one entrypoint then
 * yields exactly one output chunk and one sourcemap, so that map's `sources` is
 * the whole closure. If a future Bun ever splits by default, `readdirSync(...)
 * .find(...)` would pick one chunk's map and BOTH checks below would silently
 * measure a subset — the failure mode is a shrinking subject, not an error.
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
              if (
                opts.stopAtDynamicImport === true &&
                args.kind === "dynamic-import"
              ) {
                return { path: spec, external: true };
              }
              // Relative / absolute → repo source; let Bun resolve it.
              if (spec.startsWith(".") || spec.startsWith("/"))
                return undefined;
              // A declared tsconfig alias → repo source; let Bun resolve it.
              if (
                prefixes.some((p) => spec.startsWith(p)) ||
                exact.includes(spec)
              ) {
                return undefined;
              }
              const importer =
                args.importer === "" ? entry : relative(root, args.importer);
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
      JSON.parse(readFileSync(join(out, mapFile), "utf8")) as {
        sources: string[];
      }
    ).sources;
    // Sourcemap `sources` are relative to the map file; re-root them on the repo.
    const modules = new Set(
      sources.map((s) => relative(root, resolve(out, s))),
    );
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
const BARE_BUILTINS = new Set(
  builtinModules.filter((m) => !m.startsWith("node:")),
);

/**
 * Resolvable with `node_modules` ABSENT: Bun/Node builtins are compiled into the
 * runtime. Everything else non-relative and non-aliased is an installed package.
 */
function resolvesWithoutNodeModules(spec: string): boolean {
  if (spec.startsWith("node:") || spec === "bun" || spec.startsWith("bun:"))
    return true;
  return BARE_BUILTINS.has(spec);
}

/**
 * NO module in the CLI process's import closure may reach a registered
 * pre-barrel or post-web codegen manifest.
 *
 * WHY, precisely — this is a correctness invariant guarding authored user data,
 * not tidiness. Bun's ESM cache freezes a module on its first `import()`, and a
 * later disk write cannot invalidate it. Stage 2 of the build pipeline
 * (`generateAppSources` → `regenerateManifestCodegen`) REGENERATES every
 * pre-barrel manifest and then imports every plugin barrel to collect the
 * config_v2 descriptors those barrels register at module-load. A manifest that
 * the CLI already imported at load time is rewritten on disk and NEVER re-read:
 * the barrels then register the PREVIOUS run's descriptor set,
 * `generateConfigOrigins` records that stale set, and `pruneOrphanedConfigFiles`
 * DELETES a freshly-authored config override as an orphan. Silent data loss,
 * with no failing step to point at.
 *
 * THIS IS THE ONLY MECHANICAL PROTECTION against a load-time freeze. The two
 * things that look like they cover it do not:
 *   - `assertPreBarrelManifestsFresh` (the runtime freeze-point guard) re-renders
 *     each manifest and compares TO DISK. On a load-time freeze the disk copy is
 *     fresh — stage 2 just wrote it — so the guard passes green while the frozen
 *     copy in memory is a run behind. It detects an ORDERING mistake inside the
 *     pipeline, not a freeze that happened before the pipeline started.
 *   - `pre-barrel-manifests-complete` answers a different question entirely: is a
 *     barrel-reachable `*.generated.ts` registered as a manifest at all. It says
 *     nothing about who else imported one.
 * Nothing else in the repo can see a manifest frozen at CLI load.
 *
 * THE SUBJECT IS THE WHOLE CLI PROCESS, measured from `bin/index.ts` with
 * dynamic edges FOLLOWED — not `build.ts`, and not any one command. It has to
 * be: `release.ts` statically imports plugin barrels at module load and is in
 * every CLI process's closure, so "this command is clean" is not a property the
 * process has. `bin/index.ts` is the one entrypoint, and its
 * `await import("./cli")` is a literal specifier the bundler follows, so one
 * measurement covers both the bootstrap and the whole command surface. ~200 ms.
 *
 * This REPLACES `cli:build-composition-import-subset`, which compared two
 * command files' module sets so that `build-composition` INHERITED the property
 * from `build` rather than re-deriving it. That framing never measured the
 * stated property at all: measured on this tree, `bin/cli.ts` already statically
 * reaches 14 plugin server barrels (`release.ts` pulls `icon-picker/server`,
 * `release/bundles/server`, `asset-mirror/server`, …), so "no plugin barrel in
 * the CLI's static closure" was false then and is false now. A frozen BARREL is
 * harmless while everything it reaches is stable; the hazard is its GENERATED
 * INPUTS changing mid-run, which is what this check measures directly.
 *
 * SCOPE, stated rather than left implicit. The registry-phase outputs —
 * `checks/core/check.generated.ts`, `paths/core/data-dirs.generated.ts`,
 * `barrel-import/…/auto-stubs.generated.ts` — ARE in this closure and ARE
 * rewritten in-process by stage 1, i.e. the same mechanism. They are out of
 * scope deliberately: their staleness costs one run of registry content (a
 * missing check or a missing stub — loud, or benign), never the silent deletion
 * of authored data; and they arrive through `paths/server`, `checks/core` and
 * `barrel-import/core`, which the CLI cannot stop importing without losing the
 * ability to run checks or resolve its own data dirs. Reopening that is a
 * separate task, not a hole in this one.
 * `icon-picker/…/icon-svg-map.generated.ts` is produced by a hand-run script,
 * never by a build stage, so no build run can invalidate a frozen copy of it.
 *
 * KNOWN LIMIT, stated rather than papered over: this is a STATIC measurement.
 *   - An `import()` whose specifier is COMPUTED at runtime is invisible to the
 *     bundler, as it is to every static tool. `compositionFleetSource` /
 *     `defaultFleetSource` reach `web-tiers.generated.ts` exactly that way —
 *     harmlessly, because that happens in stage 3, after the config-origins pass
 *     has already run. A hazardous computed-specifier import would pass here.
 *   - In the other direction the check is CONSERVATIVE on purpose: following
 *     literal dynamic edges pulls every check module into the subject via
 *     `check.generated.ts`'s loaders, so a CHECK that imported a manifest would
 *     be flagged even though checks run in stage 3, after the origins pass. That
 *     is deliberate — the remedy (read the manifest's bytes instead of importing
 *     it) is cheap and independently right, so a false positive costs a small
 *     correct edit rather than an argument about phases.
 *
 * `alwaysRun: true` — cheap (~200 ms), structural, codegen-coupled, and
 * decisively: the hermetic build path runs stage 2 (and therefore
 * `pruneOrphanedConfigFiles`) while running ONLY the always-run set. A check
 * that guards stage 2 but is skipped whenever stage 2 runs without a full check
 * pass guards nothing. The check this replaces was not `alwaysRun`; that was a
 * gap, not a decision.
 */
const manifestFreezeCheck: Check = {
  id: "cli:codegen-manifests-not-frozen",
  description:
    "no module in the CLI process's import closure may reach a registered pre-barrel or post-web codegen manifest — a manifest frozen at CLI load is regenerated on disk but never re-read, and pruneOrphanedConfigFiles then deletes a freshly-authored config override",
  alwaysRun: true,
  async run() {
    const root = await getWorktreeRoot();

    // repo-relative manifest path -> manifest id, so a hit can name itself.
    const hazards = new Map<string, string>();
    for (const m of [...preBarrelManifests, ...postWebManifests]) {
      hazards.set(relative(root, m.path(root)), m.id);
    }
    // Both lists are non-empty in every tree that has a build pipeline at all,
    // so an empty hazard set means the import above resolved to something that
    // is no longer the manifest registry — and an empty comparison would then
    // report a green derived from measuring nothing. Fail loudly instead.
    if (hazards.size === 0) {
      throw new Error(
        "preBarrelManifests + postWebManifests are EMPTY, so there is nothing to compare the CLI's " +
          "import closure against. That is a broken read of codegen/core (registry moved or renamed?), " +
          "not a repo with no codegen manifests — refusing to report a pass derived from it.",
      );
    }

    const { modules } = await importClosure(root, CLI_ENTRY);

    const reached = [...hazards]
      .filter(([rel]) => modules.has(rel))
      .map(([rel, id]) => `${rel}  (${id})`)
      .sort();
    if (reached.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `The CLI process (${CLI_ENTRY}) reaches ${reached.length} codegen manifest(s) at module ` +
        `load, freezing them before the build regenerates them:\n    ` +
        reached.join("\n    "),
      hint:
        "Read the manifest's BYTES instead of importing it — `readFileSync` plus the renderer " +
        "exported next to it, which is exactly what the `*-in-sync` checks do — or move the import " +
        "behind a dynamic `import()` with a COMPUTED specifier, which does not execute (and so does " +
        "not freeze) until after stage 2. Bun freezes a module on first import() and no later disk " +
        "write invalidates it: stage 2 regenerates these manifests and then imports every plugin " +
        "barrel to collect config_v2 descriptors, so a copy frozen at CLI load makes " +
        "generateConfigOrigins see the PREVIOUS run's descriptor set and pruneOrphanedConfigFiles " +
        "delete a freshly-authored config override — silent data loss with no failing step. See " +
        "codegen/core/pre-barrel-manifests.ts.",
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
    const { external } = await importClosure(root, BOOTSTRAP, {
      stopAtDynamicImport: true,
    });

    const offenders = [...external]
      .filter(([spec]) => !resolvesWithoutNodeModules(spec))
      .map(
        ([spec, importers]) =>
          `${spec}  (imported by ${importers.sort().join(", ")})`,
      )
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

/**
 * EVERY plugin's `cli/index.ts` is loaded on EVERY `./singularity` invocation,
 * so its static import closure must stay data-weight: no npm package, no
 * `web`/`server` barrel.
 *
 * WHY THIS IS THE LOAD-BEARING HALF OF THE WHOLE MECHANISM. Commander needs a
 * command's name, flags and help text before it can parse argv, so there is no
 * way to defer a DECLARATION — `./singularity build` pays for every other
 * plugin's declaration, every time. The command's IMPLEMENTATION is the part
 * that must not load, and the declaration defers it through
 * `run: () => import("./run")`. Nothing in the language marks which half is
 * which; a contributor who writes `import { thing } from "./run"` at the top of
 * their declaration to reuse one constant has silently moved their whole command
 * body — and its npm dependencies, and every plugin barrel it reaches — into the
 * hot path of an unrelated command. That edit looks harmless and its cost is
 * invisible, which is exactly the shape that needs a mechanical check rather
 * than a documented convention.
 *
 * The `server` ban is the same rule stated where it bites hardest: a server
 * barrel is the cheapest-looking way for a declaration to reach a real value (an
 * option default like `REPO_ROOT`), and it is also the single heaviest thing in
 * the repo to load — drizzle, pg, the DB pool, the job queue. Resolve such a
 * default inside the action instead, where the import is already deferred.
 *
 * MEASURED WITH `stopAtDynamicImport`, which is the whole subtlety and the
 * reason this can be a check at all: the declaration's own
 * `run: () => import("./run")` is a literal specifier the bundler would happily
 * follow, and following it would drag in precisely the implementation this check
 * exists to keep out — reporting every correctly-written command as a failure.
 * Cutting at every `import()` edge measures exactly what the CLI pays before it
 * knows which command it is running.
 *
 * The subject list comes from `cli.generated.ts` rather than a filesystem walk,
 * so it is the same set the CLI actually loads. A `cli/index.ts` with no default
 * export is not registered, is not loaded, and is not measured — that is how a
 * shared CLI-machinery barrel (`op-runtime/cli`) sits in the same runtime
 * without being held to a declaration's weight.
 */
const declarationsLightCheck: Check = {
  id: "cli:command-declarations-light",
  description:
    "every plugin's cli/index.ts must reach no npm package and no web/server barrel through its static imports — a command DECLARATION loads on every ./singularity invocation, only its implementation is deferred",
  async run() {
    const root = await getWorktreeRoot();
    const { cliEntries } = await import("../core/cli.generated");

    // An empty registry means the collected-dir scan found no command at all,
    // which cannot be true in a tree that has a CLI — every framework command
    // is a contribution. Comparing nothing would report a green derived from a
    // broken read, so fail loudly instead.
    if (cliEntries.length === 0) {
      throw new Error(
        "cli.generated.ts registers NO commands, so there is nothing to measure. That is a broken " +
          "registry read (collected-dir marker moved or renamed?), not a CLI with no commands — " +
          "refusing to report a pass derived from it.",
      );
    }

    const offenders: string[] = [];
    for (const entry of cliEntries) {
      const rel = join("plugins", entry.pluginPath, "cli", "index.ts");
      const { modules, external } = await importClosure(root, rel, {
        stopAtDynamicImport: true,
      });

      const packages = [...external.keys()]
        .filter((spec) => !resolvesWithoutNodeModules(spec))
        .sort();
      // A cross-plugin `@plugins/x/{web,server}` import resolves to that
      // barrel's own file, so the barrels a declaration reaches — directly or
      // transitively — are exactly the runtime barrels in its module set.
      const barrels = [...modules]
        .filter((m) => /(^|\/)(web|server)\/index\.tsx?$/.test(m))
        .sort();

      if (packages.length === 0 && barrels.length === 0) continue;
      const reasons = [
        ...packages.map((p) => `npm package ${p}`),
        ...barrels.map((b) => `runtime barrel ${b}`),
      ];
      offenders.push(`${rel}\n        ${reasons.join("\n        ")}`);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${offenders.length} CLI command declaration(s) load more than data on every ` +
        `./singularity invocation:\n    ` +
        offenders.join("\n    "),
      hint:
        "Move the import into the module the declaration reaches through `run: () => import(...)`. " +
        "That import is deferred until commander routes to this command; a static import at the top " +
        "of cli/index.ts is paid by EVERY other command, including `build`. For an option default " +
        "that needs a real value, drop the commander default and resolve it inside the action " +
        "(`opts.x ?? THE_VALUE`), stating the default in the option's description.",
    };
  },
};

/**
 * No two plugins may claim the same verb.
 *
 * The failure this prevents is silent, which is why it is worth a check rather
 * than the runtime assertion in `bin/cli.ts` alone: commander keeps whichever
 * command registered first, so the loser's verb is simply absent — its plugin
 * looks installed, its folder is there, and `./singularity <verb>` runs someone
 * else's code. `bin/cli.ts` does throw on this, but only for whoever runs the
 * CLI next; catching it in `check` is what stops it reaching main.
 *
 * Loads the declarations for real (they are data by the check above, so this is
 * cheap) rather than parsing names out of source: the name a plugin registers is
 * whatever its module evaluates to, and a check that read the literal would
 * disagree with the CLI the moment one is computed.
 */
const commandNamesUniqueCheck: Check = {
  id: "cli:command-names-unique",
  description:
    "no two plugins may contribute the same ./singularity verb — commander keeps the first registration, so a collision silently deletes one plugin's command",
  async run() {
    const { cliEntries } = await import("../core/cli.generated");

    // pluginPath -> the command names it claims, at each level of the tree.
    const claims = new Map<string, string[]>();
    for (const entry of cliEntries) {
      const mod = (await entry.loader()) as { default?: unknown };
      const exported = mod.default;
      const commands = Array.isArray(exported)
        ? exported
        : exported === undefined
          ? []
          : [exported];
      for (const c of commands) {
        if (!isCliCommand(c)) {
          return {
            ok: false,
            message: `${entry.pluginPath}/cli/index.ts default-exports something that is not a CLI command.`,
            hint: "Declare it with defineCliCommand() from @plugins/framework/plugins/cli/core.",
          };
        }
        for (const path of commandPaths(c)) {
          const owners = claims.get(path) ?? [];
          owners.push(entry.pluginPath);
          claims.set(path, owners);
        }
      }
    }

    const collisions = [...claims]
      .filter(([, owners]) => owners.length > 1)
      .map(
        ([path, owners]) => `${path}  (claimed by ${owners.sort().join(", ")})`,
      )
      .sort();
    if (collisions.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${collisions.length} ./singularity verb(s) are claimed by more than one plugin:\n    ` +
        collisions.join("\n    "),
      hint:
        "A verb belongs to exactly one plugin. Rename one of them, or — if both are really the same " +
        "operation — make one a subcommand of the other so the two plugins share a group.",
    };
  },
};

/** Every dotted verb path a command occupies, e.g. `deploy`, `deploy converge`. */
function commandPaths(command: CliCommand, prefix = ""): string[] {
  const path = prefix === "" ? command.name : `${prefix} ${command.name}`;
  if (command.subcommands === undefined) return [path];
  return [path, ...command.subcommands.flatMap((s) => commandPaths(s, path))];
}

export default [
  manifestFreezeCheck,
  bootstrapPackageFreeCheck,
  declarationsLightCheck,
  commandNamesUniqueCheck,
];
