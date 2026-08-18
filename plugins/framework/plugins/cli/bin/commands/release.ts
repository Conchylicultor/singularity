import type { Command } from "commander";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  REPO_ROOT,
  checkoutWorktreeName,
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/server";
import { asFsPath } from "@plugins/framework/plugins/plugin-id/core";
import {
  buildPluginTree,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { parseEntryPattern } from "@plugins/plugin-meta/plugins/closure/core";
import {
  compositionsConfig,
  manifestItemToManifest,
} from "@plugins/plugin-meta/plugins/composition/core";
import { resolveIconSvgNodes } from "@plugins/primitives/plugins/icon-picker/server";
import { appIconToSvg } from "@plugins/apps-core/plugins/app-icon/core";
import { runAssetMirrorPrewarm } from "@plugins/infra/plugins/asset-mirror/server";
import { propagateConfigToUser } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { spawnPassthrough } from "@plugins/infra/plugins/spawn/core";
import {
  PLATFORM_TAGS,
  bunCompileTarget,
  goEnvFor,
  hostPlatformTag,
  isLinuxTag,
  isPlatformTag,
  type PlatformTag,
} from "@plugins/release/core";
import {
  claimLatestPointer,
  newReleaseRunId,
  pruneReleaseRunDirs,
  readGitProvenance,
  releaseOutDir,
} from "@plugins/release/plugins/bundles/server";

// ── Staged bundle layout (the `--dev` output, also the pack input) ────────────
//
//   <out>/                         = …/releases/<wt>/<comp>-<target>/<run-id>/
//     launch                       compiled launcher binary (entrypoint)
//     server                       compiled backend binary (gateway spawns this)
//     gateway/gateway              prebuilt Go gateway binary
//     pg/pg-start                  compiled embedded-PG start binary
//     pg/native/...                vendored embedded-postgres native tree
//     pgbouncer/pgbouncer-start    compiled PgBouncer start binary
//     pgbouncer/native/bin/pgbouncer  vendored PgBouncer native binary
//     parcel-watcher/watcher.node   vendored @parcel/watcher native addon
//     config/                      raw git-layer config tree (SINGULARITY_REPO_CONFIG_DIR)
//     config-seed/config/<comp>/   resolved config defaults, seeded into <data>/config on first run
//     web/                         filtered Vite dist (served statically)
//     RELEASE.json                 { composition, target, platform, builtAt, port, runId, commitSha, commitDirty }
//     dist/<comp>-<target>-<platform>   web target: self-extracting binary (the shippable)
//     bundle/<Name>.app, <Name>.dmg     tauri target: desktop bundle (the shippable)
//
// `launch` self-roots SINGULARITY_DIR under <out>/data and points the start
// binaries at the vendored natives via env, so the bundle is fully isolated. A
// sibling `<comp>-<target>/latest-<platform>` symlink points at the current
// PACKED <run-id> — see @plugins/release/plugins/bundles for why it is claimed
// only after packing, and never by a `--dev` or tauri run.

const DEFAULT_PORT = 9100;

const SERVER_ENTRY = "plugins/framework/plugins/server-core/bin/index.ts";
const LAUNCH_ENTRY = "plugins/infra/plugins/launcher/bin/launch.ts";
const PG_START_ENTRY = "plugins/database/plugins/embedded/scripts/start.ts";
const PGBOUNCER_START_ENTRY =
  "plugins/database/plugins/pgbouncer/scripts/start.ts";
// Tauri-only: the desktop shell runs this on app exit to stop the detached
// gateway + PG daemons it brought up via `launch`. The web self-extractor has
// no host process to drive teardown, so it ships no teardown binary.
const TEARDOWN_ENTRY = "plugins/infra/plugins/launcher/bin/teardown.ts";

// The cluster sentinel runs its sampler + duress-latch lifecycle on a Bun
// Worker. `bun --compile` does not trace/embed a `new Worker(new URL(...))`
// entry, so we bundle it separately to a standalone `.js` and vendor it on
// disk; launch.ts points SINGULARITY_SENTINEL_WORKER_JS at it and worker-host.ts
// spawns from there (mirrors the vendored parcel-watcher native addon).
const SENTINEL_WORKER_ENTRY =
  "plugins/debug/plugins/sentinel/server/internal/worker/entry.ts";

// The filtered registry the compiled backend's `@composition-server-registry`
// alias is repointed at, so the bundler's closure IS the composition closure.
// Keyed by composition NAME: filtered registries have no checkout-global
// flavour, so a release can never reconfigure another namespace's backend.
const FILTERED_SERVER_REGISTRY = (composition: string): string =>
  `plugins/framework/plugins/server-core/core/server.composition.${composition}.generated.ts`;
const FILTERED_WEB_REGISTRY = (composition: string): string =>
  `plugins/framework/plugins/web-sdk/core/web.composition.${composition}.generated.ts`;

/** The tag of the machine cutting the release, or a loud failure. */
function hostTagOrThrow(): PlatformTag {
  const host = hostPlatformTag();
  if (!host.ok) throw new Error(`release: ${host.reason}`);
  return host.tag;
}

/**
 * Resolve `--platform` to the ONE target tag every platform-bound step below
 * reads. Absent ⇒ the host's own tag, so a release with no `--platform` does
 * exactly what it did before the flag existed: cross-building is a
 * parameterization of the host path, never a second path beside it.
 *
 * Every derivation from a tag (Bun compile target, Go GOOS/GOARCH, the
 * `-glibc` parcel-watcher suffix) lives in `@plugins/release/core` — getting
 * the Bun prefix or the Go arch spelling wrong is a silent mis-build, so this
 * file names tags and never spells a mapping itself.
 */
function resolvePlatformTag(
  opt: string | undefined,
  hostTag: PlatformTag,
): PlatformTag {
  if (opt === undefined) return hostTag;
  if (!isPlatformTag(opt)) {
    console.error(
      `Unsupported --platform "${opt}". Supported platforms: ${PLATFORM_TAGS.map(
        (t) => `"${t}"`,
      ).join(", ")}.`,
    );
    process.exit(1);
  }
  return opt;
}

async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<void> {
  console.log(`  $ ${cmd.join(" ")}`);
  const { exitCode } = await spawnPassthrough(cmd, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  if (exitCode !== 0) {
    throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}`);
  }
}

/** Rasterize an SVG string to a PNG at `size`×`size` (pure-Wasm, no native deps). */
function renderPng(svg: string, size = 512): Uint8Array {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
}

/** DMG background window geometry (points). Shared by the SVG and the appdmg spec. */
const DMG_WINDOW = { width: 540, height: 380 } as const;
const DMG_ICON_SIZE = 128;
const DMG_ICON_Y = 170;
const DMG_APP_X = 130;
const DMG_APPLICATIONS_X = 410;

/** XML-escape a string for safe interpolation into the SVG background. */
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Render the styled DMG window background as a PNG (plus a `@2x` retina sibling
 * for appdmg to fold into a multi-rep TIFF). Generated per release — no committed
 * asset — so the backdrop auto-themes to each composition's name. The visible app
 * + Applications icons are real Finder icons positioned on top by the appdmg spec;
 * this image only supplies the backdrop, the drag arrow between the two drop
 * spots, and the install caption.
 */
function writeDmgBackground(productName: string, outPath: string): void {
  const { width: W, height: H } = DMG_WINDOW;
  // Arrow spans the gap between the app icon's right edge and the Applications
  // icon's left edge, centered on the icon row.
  const y = DMG_ICON_Y;
  const tail = DMG_APP_X + DMG_ICON_SIZE / 2 + 22;
  const tip = DMG_APPLICATIONS_X - DMG_ICON_SIZE / 2 - 14;
  const shaft = tip - 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbfbfd"/>
      <stop offset="1" stop-color="#ececf1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="M${tail} ${y - 8} L${shaft} ${y - 8} L${shaft} ${y - 20} L${tip} ${y} L${shaft} ${y + 20} L${shaft} ${y + 8} L${tail} ${y + 8} Z" fill="#c2c2cc"/>
  <text x="${W / 2}" y="${H - 42}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="15" fill="#6e6e73">Drag ${escapeXml(productName)} to the Applications folder</text>
</svg>`;
  // @1x must match the window point-size so Finder draws it 1:1; @2x is double.
  writeFileSync(outPath, renderPng(svg, W));
  writeFileSync(outPath.replace(/\.png$/, "@2x.png"), renderPng(svg, W * 2));
}

/**
 * Statically parse the `iconKey` out of a plugin subtree's `defineApp({...})`
 * call — no barrel import, no React, mirroring the facets static-parse approach.
 *
 * Recurses the entry app's `buildPluginTree` node (and descendants) looking for
 * the shell `core/*.ts` file that holds `defineApp(`, then extracts the
 * `iconKey: "..."` literal from that call's object argument. Distinguishes
 * "found a `defineApp` but it has no `iconKey`" (a loud Error) from "no
 * `defineApp` anywhere under this app" (returns null so the caller can throw a
 * composition-level error).
 *
 * Assumption (documented per plan): exactly one `defineApp(...)` lives in an
 * app's `core/`, and its `iconKey` is a string literal — true for every app
 * shell `core/app.ts` (e.g. `defineApp({ id, basePath, iconKey: "piano" })`).
 */
function findDefineAppIconKey(node: PluginNode): string | null {
  const coreDir = join(node.dir, "core");
  if (existsSync(coreDir)) {
    for (const f of readdirSync(coreDir)) {
      if (!f.endsWith(".ts")) continue;
      const src = readFileSync(join(coreDir, f), "utf8");
      const call = src.match(/defineApp\s*\(\s*\{([\s\S]*?)\}\s*\)/);
      const body = call?.[1];
      if (body == null) continue;
      const key = body.match(/iconKey:\s*["']([^"']+)["']/);
      if (key?.[1] != null) return key[1];
      throw new Error(
        `release: ${join(coreDir, f)} calls defineApp(...) without an iconKey. ` +
          `Add iconKey: "<md-name>" so the app is releasable.`,
      );
    }
  }
  for (const child of node.children) {
    const found = findDefineAppIconKey(child);
    if (found) return found;
  }
  return null;
}

/**
 * Map a composition name → its entry app's `iconKey`, server-side, with no
 * barrel execution. Mirrors the composition-resolution pattern in `build.ts`
 * (`compositionsConfig.fields.manifests.defaultValue` → `manifestItemToManifest`
 * → `entryPoints` like `["apps.sonata"]`; resolved against
 * `buildPluginTree(..., { skipBarrelImport: true })`), then static-parses the
 * entry app's `defineApp({...})`. Fails loudly — never silently defaults.
 */
async function resolveCompositionIconKey(opts: {
  root: string;
  composition: string;
}): Promise<string> {
  const { root, composition } = opts;

  const items = compositionsConfig.fields.manifests.defaultValue;
  const item = items.find((m) => m.id === composition);
  if (!item) {
    throw new Error(
      `release: unknown composition "${composition}". Known: ${items
        .map((m) => m.id)
        .join(", ")}`,
    );
  }

  const { entryPoints } = manifestItemToManifest(item);
  if (entryPoints.length === 0) {
    throw new Error(
      `release: composition "${composition}" has no entry points; cannot derive an app icon.`,
    );
  }

  const tree = await buildPluginTree(join(root, "plugins"), {
    skipBarrelImport: true,
  });

  // Each entry point is an EntryPattern (`id`, `id.**`, `!id.**`, or the root
  // `**`); its base id is a dotted plugin id whose tree node is keyed by the
  // fs-path encoding ("apps/plugins/sonata") in `byPath`. Negative patterns
  // exclude a subtree from the bundle — they name no app node, so skip them when
  // deriving the icon. The root `**` names no node either: it means "every
  // plugin", and a composition of everything has no single app to take an icon
  // from. Skipping it falls through to the throw below, which is right — a
  // release of the whole repo is not an app release.
  for (const entry of entryPoints) {
    const parsed = parseEntryPattern(entry);
    if (parsed.kind === "root") continue;
    if (parsed.negate) continue;
    const node = tree.byPath.get(asFsPath(parsed.base));
    if (!node) continue;
    const iconKey = findDefineAppIconKey(node);
    if (iconKey) return iconKey;
  }

  throw new Error(
    `release: composition "${composition}" (entry points ${entryPoints.join(
      ", ",
    )}) has no app shell core declaring defineApp({ iconKey }). ` +
      `App compositions must point at an app whose shell core declares an iconKey.`,
  );
}

/**
 * Compile a TS entrypoint to a standalone native binary via the `Bun.build`
 * compile API. The bundler computes the import closure by construction, so the
 * release ships no bun runtime and no TS source.
 *
 * `@plugins/*` resolves via the on-disk `tsconfig.json` nearest the entrypoint
 * (Bun.build auto-discovers it), exactly as in dev. `aliasOverride` repoints a
 * single bare specifier for THIS compile only via an `onResolve` resolver plugin
 * — used to pin the backend's `@composition-server-registry` import to the
 * filtered composition registry, so the bundled closure IS the composition
 * closure. (We use a resolver rather than `--tsconfig-override`, which
 * `bun build` does not accept.)
 *
 * `platform` selects the standalone runtime baked into the binary. Bun
 * cross-compilation is first-class — it downloads the target runtime itself
 * (`--compile-executable-path` is the offline/pinned fallback). Passing the
 * host's own tag is byte-for-byte identical to omitting the target, so this is
 * unconditional rather than a cross-build-only branch.
 */
async function compile(opts: {
  entry: string;
  outfile: string;
  root: string;
  platform: PlatformTag;
  aliasOverride?: { alias: string; target: string };
}): Promise<void> {
  const { entry, outfile, root, platform, aliasOverride } = opts;
  mkdirSync(dirname(outfile), { recursive: true });

  const plugins: Bun.BunPlugin[] = [];
  if (aliasOverride) {
    const { alias, target } = aliasOverride;
    // Anchor the regex to the exact specifier so no other import is intercepted.
    const filter = new RegExp(
      `^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    );
    plugins.push({
      name: "composition-registry-alias",
      setup(build) {
        build.onResolve({ filter }, () => ({ path: target }));
      },
    });
  }

  const result = await Bun.build({
    entrypoints: [join(root, entry)],
    compile: {
      outfile,
      // Bun types the target as a template-literal union it cannot prove a
      // computed string belongs to; `bunCompileTarget` is the single place the
      // spelling is decided, so assert rather than duplicate the union here.
      target: bunCompileTarget(platform) as Bun.Build.CompileTarget,
    },
    plugins,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error(`bun build --compile failed for ${entry}`);
  }
}

/**
 * Bundle the sentinel worker entry to a standalone `.js` (bundle mode, NOT
 * `--compile`): its lean closure (the latch leaf, log-channels, embedded-pg
 * constants, the pure detector/gatherers, and `pg`) inlines into one file that
 * the release's compiled backend spawns as a `Worker`. `bun --compile` cannot
 * embed a `new Worker(new URL(...))` entry, so the worker is vendored on disk
 * instead — launch.ts points `SINGULARITY_SENTINEL_WORKER_JS` at this file.
 */
async function bundleSentinelWorker(opts: {
  root: string;
  outfile: string;
}): Promise<void> {
  const { root, outfile } = opts;
  mkdirSync(dirname(outfile), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(root, SENTINEL_WORKER_ENTRY)],
    outdir: dirname(outfile),
    naming: basename(outfile),
    target: "bun",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error(
      `bun build failed for the sentinel worker (${SENTINEL_WORKER_ENTRY})`,
    );
  }
}

// ── Vendored native packages ──────────────────────────────────────────────────
//
// Three native packages are copied into the bundle: the embedded-Postgres tree,
// the PgBouncer binary, and @parcel/watcher's prebuilt `.node` addon. All three
// are `os`/`cpu`-gated optionalDependencies, so the repo's node_modules only
// ever holds the HOST's variant — a cross-platform release has to fetch the
// target's.
//
// `NativeSource` is that fork, resolved once by the caller so the three
// resolvers below stay dumb path builders:
//
//   • `repo`   — the host tag: resolve in place, byte-for-byte the pre-`--platform`
//                path, so a plain release touches no new machinery at all.
//   • `staged` — a foreign tag: a `bun install --os=<os> --cpu=<cpu>` tree under
//                a cache dir, joined into directly (`Bun.resolveSync` is useless
//                here — the target package is not in the host's resolution graph).
type NativeSource = { kind: "repo" } | { kind: "staged"; dir: string };

/** The `@parcel/watcher` platform package for a tag. */
function parcelWatcherPkg(tag: PlatformTag): string {
  // parcel suffixes linux packages with -glibc/-musl; releases target glibc.
  // This MUST key off the TARGET, not the host: read from `process.platform` it
  // silently picks the nonexistent `@parcel/watcher-linux-x64` whenever a Mac
  // cross-builds for linux, and throws a misleading "run `bun install`".
  return isLinuxTag(tag)
    ? `@parcel/watcher-${tag}-glibc`
    : `@parcel/watcher-${tag}`;
}

/** A missing native is fatal, but the remedy differs by where we looked. */
function missingNative(what: string, path: string, src: NativeSource): Error {
  return new Error(
    src.kind === "repo"
      ? `release: ${what} not found at ${path}; run \`bun install\` first`
      : `release: ${what} not found at ${path}; the staged target-platform install did not provide it`,
  );
}

/** The version of an installed package, read from its own package.json. */
function installedVersion(pkgDir: string, what: string): string {
  const pkgJson = join(pkgDir, "package.json");
  if (!existsSync(pkgJson)) {
    throw new Error(
      `release: ${what} not installed at ${pkgDir}; run \`bun install\` first`,
    );
  }
  const { version } = JSON.parse(readFileSync(pkgJson, "utf8")) as {
    version?: string;
  };
  if (!version) {
    throw new Error(`release: ${pkgJson} declares no "version"`);
  }
  return version;
}

/**
 * Fetch the three native packages for a FOREIGN platform tag and return the dir
 * whose `node_modules/` holds them.
 *
 * Two constraints on this fetch, both load-bearing:
 *
 *   • **Never install into the repo root.** `--os`/`--cpu` re-solve the whole
 *     optional set, so a linux install in-tree PRUNES the host's darwin-arm64
 *     natives out of the shared node_modules and breaks the dev cluster.
 *   • **Never call this before phase 1.** `build-composition` shells a plain
 *     `bun install` (`commands/internal/app-artifacts.ts`), which would re-prune
 *     anything staged earlier — so the call site sits in phase 3, not up front.
 *     (That install is also what guarantees the host versions read below are on
 *     disk at all, e.g. in a fresh worktree.)
 *
 * Versions are read from what the HOST has installed rather than written as
 * literals here: `bun.lock` pins every platform variant of a package to one
 * version, so the host's version IS the target's, and there is no second place
 * to bump. (For @parcel/watcher it is also the only correct answer — the addon's
 * ABI is tied to the `@parcel/watcher` the compiled backend bundles.)
 */
async function stageForeignNatives(opts: {
  root: string;
  tag: PlatformTag;
  hostTag: PlatformTag;
}): Promise<string> {
  const { root, tag, hostTag } = opts;

  const embeddedDir = join(
    root,
    "plugins/database/plugins/embedded/node_modules",
    `@embedded-postgres/${hostTag}`,
  );
  const pgbouncerDir = join(
    root,
    "plugins/database/plugins/pgbouncer/node_modules",
    `@equin/pgbouncer-${hostTag}`,
  );
  const watcherDir = dirname(Bun.resolveSync("@parcel/watcher", root));

  const deps: Record<string, string> = {
    [`@embedded-postgres/${tag}`]: installedVersion(
      embeddedDir,
      "embedded-postgres",
    ),
    [`@equin/pgbouncer-${tag}`]: installedVersion(pgbouncerDir, "pgbouncer"),
    [parcelWatcherPkg(tag)]: installedVersion(watcherDir, "@parcel/watcher"),
  };

  // Keyed on the tag AND the resolved versions, so a dependency bump can never
  // be served a stale tree — and two releases for the same tag share one fetch.
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify(deps));
  const cacheDir = join(
    tmpdir(),
    "equin-release-natives",
    `${tag}-${hasher.digest("hex").slice(0, 12)}`,
  );
  if (existsSync(join(cacheDir, "node_modules"))) {
    console.log(`  • ${tag} native packages (cached): ${cacheDir}`);
    return cacheDir;
  }

  // bun's install overrides take npm's own `os`/`cpu` spelling, which is exactly
  // the tag's two halves — a split, not a mapping, so nothing is re-derived here.
  const [os, cpu] = tag.split("-") as [string, string];
  console.log(
    `  • staging ${tag} native packages (bun install --os=${os} --cpu=${cpu})`,
  );
  // Populate a scratch dir and rename it into place, so a concurrent release for
  // the same tag can never read a half-installed tree (same temp+rename shape as
  // the worktree DB fork).
  mkdirSync(dirname(cacheDir), { recursive: true });
  const staging = mkdtempSync(`${cacheDir}.tmp-`);
  try {
    writeFileSync(
      join(staging, "package.json"),
      JSON.stringify(
        { name: "equin-release-natives", private: true, dependencies: deps },
        null,
        2,
      ) + "\n",
    );
    await run(["bun", "install", `--os=${os}`, `--cpu=${cpu}`], {
      cwd: staging,
    });
    renameSync(staging, cacheDir);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    // A concurrent release winning the rename is the ONE tolerable failure: its
    // tree is equivalent, because the cache key IS the full dependency set.
    // Anything else — a failed install, a bad version — must surface.
    if (!existsSync(join(cacheDir, "node_modules"))) throw err;
  }
  return cacheDir;
}

/** Resolve the embedded-postgres native dir for the target platform. */
function embeddedNativeDir(
  root: string,
  tag: PlatformTag,
  src: NativeSource,
): string {
  const pkg = `@embedded-postgres/${tag}`;
  const dir =
    src.kind === "repo"
      ? join(
          root,
          "plugins/database/plugins/embedded/node_modules",
          pkg,
          "native",
        )
      : join(src.dir, "node_modules", pkg, "native");
  if (!existsSync(dir)) {
    throw missingNative("embedded-postgres native dir", dir, src);
  }
  return dir;
}

/** Resolve the PgBouncer native binary for the target platform. */
function pgbouncerNativeBin(
  root: string,
  tag: PlatformTag,
  src: NativeSource,
): string {
  const pkg = `@equin/pgbouncer-${tag}`;
  const bin =
    src.kind === "repo"
      ? join(
          root,
          "plugins/database/plugins/pgbouncer/node_modules",
          pkg,
          "native/bin/pgbouncer",
        )
      : join(src.dir, "node_modules", pkg, "native/bin/pgbouncer");
  if (!existsSync(bin)) {
    throw missingNative("pgbouncer native binary", bin, src);
  }
  return bin;
}

/** Resolve the @parcel/watcher prebuilt native .node for the target platform. */
function parcelWatcherNativeNode(
  root: string,
  tag: PlatformTag,
  src: NativeSource,
): string {
  const pkg = parcelWatcherPkg(tag);
  let file: string;
  if (src.kind === "repo") {
    // The platform package is an optionalDependency of @parcel/watcher and lives in
    // bun's store (not symlinked at top-level node_modules), so resolve it FROM
    // @parcel/watcher's own dir. Its package.json main is "watcher.node".
    const parcelDir = dirname(Bun.resolveSync("@parcel/watcher", root));
    file = join(
      dirname(Bun.resolveSync(`${pkg}/package.json`, parcelDir)),
      "watcher.node",
    );
  } else {
    file = join(src.dir, "node_modules", pkg, "watcher.node");
  }
  if (!existsSync(file)) {
    throw missingNative("parcel-watcher native", file, src);
  }
  return file;
}

export function registerRelease(program: Command) {
  program
    .command("release")
    .description(
      "Emit a portable, self-contained app artifact (compiled binaries + vendored native PG/PgBouncer/gateway) that serves a composition on a fresh host",
    )
    .requiredOption("--composition <name>", "Composition to release")
    .option("--target <target>", "Release target: web (tauri is F5)", "web")
    .option(
      "--dev",
      "Emit the staged directory only; skip the single-binary pack",
    )
    .option(
      "--out <dir>",
      "Output directory (default: the canonical versioned releases run dir for <name>-<target>)",
    )
    .option(
      "--port <port>",
      "Listen port baked into RELEASE.json",
      String(DEFAULT_PORT),
    )
    .option(
      "--platform <tag>",
      `Target platform — ${PLATFORM_TAGS.join(" | ")} (default: this host). Cross-building keeps build inputs off production hosts.`,
    )
    .action(
      async (opts: {
        composition: string;
        target: string;
        dev?: boolean;
        out?: string;
        port: string;
        platform?: string;
      }) => {
        const root = REPO_ROOT;

        if (opts.target !== "web" && opts.target !== "tauri") {
          console.error(
            `Unsupported --target "${opts.target}". Supported targets: "web", "tauri".`,
          );
          process.exit(1);
        }

        const port = Number(opts.port);
        if (!Number.isInteger(port) || port <= 0) {
          console.error(`Invalid --port: ${opts.port}`);
          process.exit(1);
        }

        const hostTag = hostTagOrThrow();
        const platform = resolvePlatformTag(opts.platform, hostTag);

        // Cross-building tauri is genuinely impossible, not merely unwired: the
        // Rust build needs the target's webview SDK (webkit2gtk on linux), and
        // the macOS path shells `xcrun` + `appdmg`. Refuse here rather than fail
        // deep inside cargo with a sysroot error.
        if (opts.target === "tauri" && platform !== hostTag) {
          console.error(
            `--target tauri cannot cross-build (--platform ${platform} on a ${hostTag} host): ` +
              `a desktop bundle needs the target's Rust toolchain + webview SDK, and on macOS xcrun/appdmg. ` +
              `Use --target web for a foreign platform.`,
          );
          process.exit(1);
        }

        // Versioned, self-contained out dir under the canonical releases root
        // (shared with the Studio engine). When the engine supplies `--out` it is
        // already a `<…>/<run-id>` dir; derive the run-id from the dir name so
        // both paths are handled uniformly.
        const out =
          opts.out ??
          releaseOutDir(opts.composition, opts.target, newReleaseRunId());
        const runId = basename(out);

        console.log(
          `Releasing composition "${opts.composition}" (${platform})`,
        );
        if (platform !== hostTag) {
          console.log(`  Cross-building from ${hostTag}`);
        }
        console.log(`  Output: ${out}`);

        // ── 0. Provenance, read BEFORE anything touches the tree ─────────────
        // Step 1 (`build --hermetic`) writes generated files into the checkout,
        // so a dirty read taken after it reports every release as dirty and says
        // nothing about what the human left behind. Untracked files count: vite
        // builds them into the dist, so they are part of the artifact.
        const provenance = await readGitProvenance(root);
        console.log(
          `  Commit: ${provenance.commitSha}${provenance.commitDirty ? " (dirty worktree)" : ""}`,
        );

        // ── 1. Composition artifact phase (hermetic) ─────────────────────────
        // `build --hermetic` is the ARTIFACT posture of `./singularity build`:
        // filtered composition registries, generated migration SQL and the web
        // dist — exactly the three outputs staged below — with the dev-cluster
        // DEPLOY half structurally absent (no Postgres readiness, no worktree DB
        // fork, no gateway spec/restart/health probe, no compose-serve, no
        // `build_runs` ledger). Both postures drive the SAME module
        // (commands/internal/app-artifacts.ts), so the phase a release runs and
        // the phase a dev build runs cannot drift. Rationale:
        // research/2026-07-28-cli-hermetic-artifact-phase.md and
        // research/2026-08-18-cli-one-build-verb-artifact-half.md.
        //
        // It is still SHELLED OUT TO rather than called in-process, and that is
        // the CORRECTNESS BOUNDARY, not an implementation detail: this module
        // statically imports plugin barrels (resolveIconSvgNodes,
        // runAssetMirrorPrewarm, propagateConfigToUser, buildPluginTree), and ESM
        // imports are hoisted and evaluated before this action body runs — so by
        // now Bun's module cache has those barrels FROZEN. Stage 2's
        // `regenerateManifestCodegen` arms `setPreBarrelImportGuard` before the
        // first barrel import; in a pre-frozen process that guard never fires,
        // `generateConfigOrigins` re-imports stale barrels and
        // `pruneOrphanedConfigFiles` deletes a freshly-authored config override.
        // A fresh process is what makes that impossible. The mechanical
        // enforcement is now process-level — `cli:codegen-manifests-not-frozen`
        // asserts no module in the CLI's import closure reaches a registered
        // pre-barrel/post-web manifest — rather than the old "keep this command
        // file's import set a subset of build.ts's".
        //
        // ONE recorded behaviour delta from the `build-composition` command this
        // replaces: `build` is in `orphan-guard.ts`'s `OP_COMMANDS` and
        // `bin/index.ts` matches on `process.argv[2]` before any flag parsing, so
        // the child now installs the orphan guard. Its ppid is THIS process, so
        // the guard is inert unless `release` itself dies — in which case the
        // child exiting, and dropping `.build.lock` with it, is exactly right.
        // `build-composition` stayed out of `OP_COMMANDS` because op commands
        // once re-exec'd under `bun --inspect`; that re-exec was removed
        // 2026-07-28 with the op-wedge watchdog, so the reason is gone.
        //
        // Versus the nested `build --composition --no-restart --skip-checks
        // --allow-main` this replaces: no `--allow-main` (a release no longer has
        // to routinise the DANGER flag on every cut from main — the branch guard
        // it defeated exists to stop agents DEPLOYING from main, and there is no
        // deploy here), no compose-serve pass, and no build_runs row /
        // worktree-op marker / build-progress entry — a release is not a build
        // run and no longer shows up in the build Gantt as one. The old
        // `--skip-checks` validation set (always-run checks + one incremental tsc
        // per runtime entrypoint) still runs, from the same shared module.
        console.log(
          "\n[1/5] Building composition (filtered registries + web dist)...",
        );
        await run(
          [
            "bun",
            join(root, "plugins/framework/plugins/cli/bin/index.ts"),
            "build",
            // `--hermetic` BEFORE `--composition`: the latter is variadic and
            // commander consumes greedily up to the next flag.
            "--hermetic",
            "--composition",
            opts.composition,
          ],
          { cwd: root },
        );

        const serverRegRel = FILTERED_SERVER_REGISTRY(opts.composition);
        const webRegRel = FILTERED_WEB_REGISTRY(opts.composition);
        const filteredServerReg = join(root, serverRegRel);
        const filteredWebReg = join(root, webRegRel);
        if (!existsSync(filteredServerReg)) {
          console.error(
            `Composition build did not produce ${serverRegRel}. Is "${opts.composition}" a known composition?`,
          );
          process.exit(1);
        }
        if (!existsSync(filteredWebReg)) {
          console.error(`Composition build did not produce ${webRegRel}.`);
          process.exit(1);
        }

        // The RELEASE dist phase 1 just published — scratch, keyed by (this
        // checkout, composition), and nothing the gateway serves. Derived from
        // the identity, never spelled as a path: the checkout's own served dist
        // is a different tree, and publishing over it is the bug this stage
        // closes (research/2026-08-06-global-one-dist-per-namespace.md, S3).
        //
        // `checkoutWorktreeName(root)` — NOT `currentWorktreeName()`, which
        // answers "singularity" in a hand-run CLI from every worktree. Phase 1
        // is spawned with `cwd: root`, so its `basename(getWorktreeRoot())`
        // resolves to this same name and the two processes agree by
        // construction rather than by coincidence.
        const releaseDist = worktreeArtifacts.releaseWebDist(
          checkoutWorktreeName(root),
          opts.composition,
        );
        if (!existsSync(releaseDist)) {
          console.error(`Web dist not found at ${releaseDist}.`);
          process.exit(1);
        }
        // It is a symlink → `<base>.live.<pid>`; follow it to the real tree.
        const webDistReal = realpathSync(releaseDist);

        // Stage from scratch.
        rmSync(out, { recursive: true, force: true });
        mkdirSync(out, { recursive: true });

        // ── 2. Compile entrypoints ───────────────────────────────────────────
        console.log("\n[2/5] Compiling entrypoints (bun build --compile)...");

        console.log("  • backend (filtered closure)");
        await compile({
          entry: SERVER_ENTRY,
          outfile: join(out, "server"),
          root,
          platform,
          aliasOverride: {
            alias: "@composition-server-registry",
            target: filteredServerReg,
          },
        });

        console.log("  • launcher");
        await compile({
          entry: LAUNCH_ENTRY,
          outfile: join(out, "launch"),
          root,
          platform,
        });

        console.log("  • pg-start");
        await compile({
          entry: PG_START_ENTRY,
          outfile: join(out, "pg", "pg-start"),
          root,
          platform,
        });

        console.log("  • pgbouncer-start");
        await compile({
          entry: PGBOUNCER_START_ENTRY,
          outfile: join(out, "pgbouncer", "pgbouncer-start"),
          root,
          platform,
        });

        if (opts.target === "tauri") {
          console.log("  • teardown (desktop exit hook)");
          await compile({
            entry: TEARDOWN_ENTRY,
            outfile: join(out, "teardown"),
            root,
            platform,
          });
        }

        // ── 3. Vendor native binaries + web dist ─────────────────────────────
        console.log("\n[3/5] Vendoring native binaries + web dist...");

        // Where the target's native packages come from. Resolved HERE and not
        // earlier: phase 1's `build-composition` shells a plain `bun install`,
        // which would re-prune anything staged before it. For the host tag this
        // is the in-repo path, unchanged.
        const natives: NativeSource =
          platform === hostTag
            ? { kind: "repo" }
            : {
                kind: "staged",
                dir: await stageForeignNatives({
                  root,
                  tag: platform,
                  hostTag,
                }),
              };

        // Gateway: build it (forced) so the bundle ships a fresh prebuilt.
        // `-o` writes STRAIGHT into <out> — never into <repo>/gateway/gateway,
        // which is the path `buildOrLocateGateway` (launcher boot.ts)
        // short-circuits on: a cross-build leaving a linux binary there would
        // make a later `./singularity start` silently launch a linux gateway on
        // the Mac.
        console.log("  • gateway (go build)");
        const gatewayOut = join(out, "gateway", "gateway");
        mkdirSync(dirname(gatewayOut), { recursive: true });
        await run(["go", "build", "-o", gatewayOut, "."], {
          cwd: join(root, "gateway"),
          env: {
            ...goEnvFor(platform),
            // cgo is a function of the TARGET OS, not a blanket 0. The darwin
            // sigaction shim (`gateway/sigterm_darwin.go`) is a cgo file whose
            // pure-Go twin is `//go:build !darwin`, so CGO_ENABLED=0 on a darwin
            // target compiles NEITHER (`undefined: logSigtermSender`) — and Go
            // defaults cgo OFF whenever GOOS/GOARCH differ from the host, so
            // even darwin-arm64 → darwin-x64 needs it explicitly ON. Linux takes
            // the pure-Go twin and wants 0, for a static binary that depends on
            // no glibc version on the production host.
            CGO_ENABLED: isLinuxTag(platform) ? "0" : "1",
          },
        });

        // Embedded PG: copy the whole native/ tree (bin + lib + symlink manifest).
        console.log("  • embedded-postgres native tree");
        cpSync(
          embeddedNativeDir(root, platform, natives),
          join(out, "pg", "native"),
          { recursive: true },
        );

        // PgBouncer: copy the single native binary.
        console.log("  • pgbouncer native binary");
        mkdirSync(join(out, "pgbouncer", "native", "bin"), { recursive: true });
        cpSync(
          pgbouncerNativeBin(root, platform, natives),
          join(out, "pgbouncer", "native", "bin", "pgbouncer"),
        );

        // @parcel/watcher native addon: bun --compile can't embed .node addons, so the
        // file-watcher loader dlopens this vendored copy at runtime (SINGULARITY_PARCEL_WATCHER_NODE).
        console.log("  • parcel-watcher native addon");
        mkdirSync(join(out, "parcel-watcher"), { recursive: true });
        cpSync(
          parcelWatcherNativeNode(root, platform, natives),
          join(out, "parcel-watcher", "watcher.node"),
        );

        // Sentinel worker: `bun --compile` can't embed the `new Worker(new
        // URL(...))` entry, so bundle it to a standalone .js the backend spawns
        // via SINGULARITY_SENTINEL_WORKER_JS (set by launch.ts).
        console.log("  • sentinel worker bundle");
        await bundleSentinelWorker({
          root,
          outfile: join(out, "sentinel", "worker.js"),
        });

        // Migration SQL files: the runner reads them from disk at boot (they are
        // not bundled into the compiled backend). Vendor the whole data/ tree;
        // launch.ts points SINGULARITY_MIGRATIONS_DIR at it.
        console.log("  • migration data");
        cpSync(
          join(root, "plugins/database/plugins/migrations/data"),
          join(out, "migrations", "data"),
          { recursive: true },
        );

        // Web dist (follow the symlink).
        console.log("  • web dist");
        cpSync(webDistReal, join(out, "web"), { recursive: true });

        // RELEASE.json
        const manifest = {
          composition: opts.composition,
          target: opts.target,
          platform,
          builtAt: new Date().toISOString(),
          port,
          runId,
          ...provenance,
        };
        writeFileSync(
          join(out, "RELEASE.json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );

        // ── 3.5. Pre-warm asset-mirror caches for the composition closure ────
        // Bakes out/asset-mirror/<id>/<file> into the staged tree so the bundle
        // ships offline-ready audio/assets. Generic — it runs whatever the
        // closure's `prewarm` contributions declare, no app-specific code. Runs
        // here, before any target-specific packing, so it covers both --target
        // web (packStagedTree tars it) and --target tauri (wrapTauri embeds the
        // staged tree as a resource). Phase 1's `build-composition` already
        // regenerated the filtered prewarm.composition.<name>.generated the
        // runner reads.
        console.log(
          "\n[3.5] Pre-warming asset-mirror caches for the composition closure...",
        );
        await runAssetMirrorPrewarm({
          composition: opts.composition,
          destRoot: join(out, "asset-mirror"),
          log: console.log,
        });

        // ── 3.6. Vendor config: raw git-layer tree (raw-diff/un-fork reads) +
        //         resolved default seed (effective values). ────────────────────
        // Nothing config-related was shipped before, so a released app dropped
        // every config_v2 "default-for-everyone" value at runtime. release.ts runs
        // in the full dev toolchain, so it reuses codegen's exact propagation.
        console.log("\n[3.6] Vendoring config defaults...");

        // (a) Raw git-layer tree → REPO_CONFIG_DIR at runtime (raw-diff panel +
        //     per-app un-fork check, which read REPO_ROOT/config directly).
        console.log("  • git-layer config tree");
        cpSync(join(root, "config"), join(out, "config"), { recursive: true });

        // (b) Resolved default-for-everyone seed for the composition (effective
        //     values). The destination is a BUNDLE path, not a data root — an
        //     empty staging dir yields ONLY resolved origins (+ @app scoped
        //     origins), no personal overrides/ancestors. This is the one caller
        //     that does not write into `state/config`, which is why
        //     propagateConfigToUser takes the resolved directory. `launcher`'s
        //     `seedReleaseConfig` reads this same `config-seed/config/<name>`
        //     layout back at first run. discoverConfigs walks the full config/
        //     tree — shipping origins for plugins absent from the composition is
        //     harmless (the backend only reads registered descriptors).
        console.log("  • resolved config defaults");
        await propagateConfigToUser({
          root,
          userConfigDir: join(out, "config-seed", "config", opts.composition),
        });

        // ── 4. Tauri target: wrap the staged bundle in the desktop shell ─────
        // The staged tree (steps 1–3) is identical to the web bundle; the Tauri
        // shell just embeds it as a resource and drives launch/teardown. Reads
        // the app name + port from the staged RELEASE.json — no app-specific code.
        if (opts.target === "tauri") {
          await wrapTauri({
            stagedDir: out,
            root,
            composition: opts.composition,
            dev: !!opts.dev,
            port,
          });
          return;
        }

        // ── 4. --dev: stop at the staged dir (web) ───────────────────────────
        if (opts.dev) {
          console.log("\n[done] Staged release (--dev):");
          console.log(`  ${out}`);
          console.log(
            "\nRun it (self-roots SINGULARITY_DIR under <out>/data):",
          );
          console.log(`  ${join(out, "launch")}`);
          console.log(`\nThen: http://${opts.composition}.localhost:${port}`);
          return;
        }

        // ── 5. Pack into a single self-extracting binary ─────────────────────
        console.log(
          "\n[4/5] Packing staged tree into a self-extracting binary...",
        );
        const binaryPath = await packStagedTree({
          stagedDir: out,
          root,
          composition: opts.composition,
          target: opts.target,
          platform,
        });

        // ── 6. Claim the pointer, then sweep ─────────────────────────────────
        // The pointer is claimed HERE and nowhere else: only a PACKED run may
        // name itself `latest-<platform>`, so `ship`'s bare (no `--release`)
        // path can never resolve a `--dev` staging dir. Keyed by platform, so a
        // host build and a cross-built candidate of the same composition no
        // longer overwrite each other.
        const compDir = dirname(out);
        claimLatestPointer(compDir, runId, platform);

        // A run dir is a whole staged app; `~/.singularity/state/releases/` has no
        // other retention. Runs a pointer names are never swept.
        const pruned = pruneReleaseRunDirs(
          currentWorktreeName(),
          opts.composition,
          opts.target,
        );
        if (pruned.removed.length > 0) {
          console.log(
            `\n[prune] Removed ${pruned.removed.length} old run dir(s): ${pruned.removed.join(", ")}`,
          );
        }

        console.log("\n[done] Self-contained binary:");
        console.log(`  ${binaryPath}`);
        console.log(`\nRun it: ${binaryPath}`);
        console.log(`Then: http://${opts.composition}.localhost:${port}`);
      },
    );
}

/**
 * Wrap a staged self-contained bundle in the Tauri desktop shell and build (or
 * dev-run) a host-platform app.
 *
 * The committed `tauri/` Rust project is generic — it reads the app name + port
 * from the bundled `RELEASE.json` at runtime, so the only per-release inputs are
 * the staged tree (copied into `src-tauri/resources/bundle/`) and a small config
 * override (productName / identifier / window title) merged over the base
 * `tauri.conf.json`. Requires a Rust toolchain + platform webview SDK on the
 * build host (not on the end-user machine).
 */
async function wrapTauri(opts: {
  stagedDir: string;
  root: string;
  composition: string;
  dev: boolean;
  port: number;
}): Promise<void> {
  const { stagedDir, root, composition, dev } = opts;
  const tauriDir = join(root, "tauri");
  const srcTauri = join(tauriDir, "src-tauri");
  const bundleDir = join(srcTauri, "resources", "bundle");

  if (!existsSync(srcTauri)) {
    throw new Error(`Tauri project not found at ${srcTauri}.`);
  }

  // Embed the staged bundle as a Tauri resource (gitignored; replaced each build).
  console.log("\n[tauri] Copying staged bundle into Tauri resources...");
  rmSync(bundleDir, { recursive: true, force: true });
  mkdirSync(dirname(bundleDir), { recursive: true });
  cpSync(stagedDir, bundleDir, { recursive: true });

  // Composition-specific config merged over the committed base conf via --config.
  const safeId = composition.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const productName =
    composition.charAt(0).toUpperCase() + composition.slice(1);
  const override = {
    productName,
    identifier: `ai.equin.${safeId}`,
    app: { windows: [{ title: productName }] },
  };
  const overridePath = join(srcTauri, "tauri.conf.override.json");
  writeFileSync(overridePath, JSON.stringify(override, null, 2) + "\n");

  // ── Generate the platform icon set from the composition's app icon ──────────
  // Resolve the composition's entry app → iconKey → MD glyph nodes, render a
  // 512px PNG, and hand it to `tauri icon` (writes the full set into icons/ next
  // to tauri.conf.json). Always regenerate so a clean checkout (icons/ gitignored
  // + absent) builds end-to-end, and the macOS dmg step's icon.icns is populated.
  const iconKey = await resolveCompositionIconKey({ root, composition });
  const svgNodes = resolveIconSvgNodes(iconKey);
  if (!svgNodes)
    throw new Error(
      `release: app "${composition}" iconKey "${iconKey}" did not resolve to an icon.`,
    );
  const svg = appIconToSvg({ kind: "md", svgNodes });
  const pngPath = join(tmpdir(), `${composition}-appicon-512.png`);
  writeFileSync(pngPath, renderPng(svg, 512));
  console.log("\n[tauri] Generating icon set from app icon...");
  await run(["bun", "x", "@tauri-apps/cli@2", "icon", pngPath], {
    cwd: tauriDir,
  });
  const iconsDir = join(srcTauri, "icons");
  for (const f of [
    "32x32.png",
    "128x128.png",
    "128x128@2x.png",
    "icon.icns",
    "icon.ico",
  ]) {
    if (!existsSync(join(iconsDir, f))) {
      throw new Error(
        `release: tauri icon did not produce ${f} in ${iconsDir}`,
      );
    }
  }

  if (dev) {
    console.log("\n[tauri] Running tauri dev (host platform)...");
    await run(
      ["bun", "x", "@tauri-apps/cli@2", "dev", "--config", overridePath],
      { cwd: tauriDir },
    );
    return;
  }

  // macOS: build only the `.app` (`--bundles app`) so Tauri never attempts its
  // Finder/AppleScript dmg step (which times out headlessly with -1712), then
  // package the dmg ourselves with `appdmg` (writes the `.DS_Store` directly).
  // Other platforms: the default bundles are all headless-safe.
  if (process.platform === "darwin") {
    console.log(
      "\n[tauri] Running tauri build --bundles app (host platform)...",
    );
    await run(
      [
        "bun",
        "x",
        "@tauri-apps/cli@2",
        "build",
        "--config",
        overridePath,
        "--bundles",
        "app",
      ],
      { cwd: tauriDir },
    );

    const dmgPath = await packageMacDmg({ srcTauri, productName });

    // Copy the shippable .app + .dmg INTO <out>/bundle/ so the run dir is the
    // single self-contained home for the artifact (cargo emits them under
    // target/release/bundle, outside <out> otherwise).
    const appSrc = join(
      srcTauri,
      "target/release/bundle/macos",
      `${productName}.app`,
    );
    const bundleOut = join(stagedDir, "bundle");
    mkdirSync(bundleOut, { recursive: true });
    const appOut = join(bundleOut, `${productName}.app`);
    const dmgOut = join(bundleOut, basename(dmgPath));
    cpSync(appSrc, appOut, { recursive: true });
    cpSync(dmgPath, dmgOut);

    console.log("\n[done] Tauri desktop bundle built. Artifacts:");
    console.log(`  ${appOut}`);
    console.log(`  ${dmgOut}`);
    return;
  }

  console.log("\n[tauri] Running tauri build (host platform)...");
  await run(
    ["bun", "x", "@tauri-apps/cli@2", "build", "--config", overridePath],
    {
      cwd: tauriDir,
    },
  );

  // Copy the produced bundle tree INTO <out>/bundle/ so the run dir holds the
  // shippable artifact (cargo emits it under target/release/bundle otherwise).
  const bundleSrc = join(srcTauri, "target", "release", "bundle");
  const bundleOut = join(stagedDir, "bundle");
  mkdirSync(bundleOut, { recursive: true });
  cpSync(bundleSrc, bundleOut, { recursive: true });

  console.log("\n[done] Tauri desktop bundle built. Artifacts under:");
  console.log(`  ${bundleOut}`);
}

/**
 * Package an already-built macOS `.app` into a styled `.dmg` headlessly with
 * `appdmg` (a Node tool that writes the `.DS_Store` window layout directly via
 * `ds-store` and assembles with `hdiutil` — sending no AppleEvent to Finder, so
 * it never hits the -1712 timeout that breaks Tauri's own dmg step in a headless
 * shell). Invoked as `bun x appdmg <spec> <out>`, matching the existing
 * `bun x @tauri-apps/cli@2` pattern. Returns the produced dmg path.
 */
async function packageMacDmg(opts: {
  srcTauri: string;
  productName: string;
}): Promise<string> {
  const { srcTauri, productName } = opts;

  const appPath = join(
    srcTauri,
    "target/release/bundle/macos",
    `${productName}.app`,
  );
  const icnsPath = join(srcTauri, "icons/icon.icns");
  const dmgDir = join(srcTauri, "target/release/bundle/dmg");
  const dmgOut = join(dmgDir, `${productName}.dmg`);
  mkdirSync(dmgDir, { recursive: true });

  // Generate the styled window background (themed to the product name). appdmg
  // auto-detects the `@2x.png` sibling and folds both into a retina TIFF.
  const bgPath = join(tmpdir(), `${productName}-dmg-bg.png`);
  writeDmgBackground(productName, bgPath);

  // Generated, gitignored appdmg spec (mirrors tauri.conf.override.json).
  const spec = {
    title: productName,
    icon: icnsPath,
    background: bgPath,
    "icon-size": DMG_ICON_SIZE,
    window: { size: { ...DMG_WINDOW } },
    contents: [
      { x: DMG_APP_X, y: DMG_ICON_Y, type: "file", path: appPath },
      {
        x: DMG_APPLICATIONS_X,
        y: DMG_ICON_Y,
        type: "link",
        path: "/Applications",
      },
    ],
  };
  const specPath = join(srcTauri, "appdmg.spec.json");
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");

  // appdmg refuses to overwrite an existing dmg, so clear it for idempotent re-runs.
  rmSync(dmgOut, { force: true });

  console.log("\n[tauri] Packaging dmg headlessly (appdmg)...");
  await run(["bun", "x", "appdmg@0.6.6", specPath, dmgOut], { cwd: srcTauri });

  console.log(`\n[tauri] Packaged dmg: ${dmgOut}`);

  // Guarded notarize + staple. The App Store Connect API key (.p8 PEM + Key ID +
  // Issuer ID) is injected into the build env by the release engine
  // (Release.EnvProvider). When absent — a bare local build, or no creds
  // configured — the dmg is simply left un-notarized (graceful degradation, no
  // hard failure). `notarytool --key` wants a file path, so write the PEM to a
  // 0600 temp .p8 and clean it up unconditionally afterwards.
  const keyPem = process.env.APPLE_API_KEY_PEM;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuerId = process.env.APPLE_API_ISSUER_ID;
  if (keyPem && keyId && issuerId) {
    const tmpDir = mkdtempSync(join(tmpdir(), "equin-notary-"));
    const keyPath = join(tmpDir, "AuthKey.p8");
    try {
      writeFileSync(keyPath, keyPem, { mode: 0o600 });
      console.log("\n[tauri] Notarizing dmg (notarytool submit --wait)...");
      await run(
        [
          "xcrun",
          "notarytool",
          "submit",
          dmgOut,
          "--key",
          keyPath,
          "--key-id",
          keyId,
          "--issuer",
          issuerId,
          "--wait",
        ],
        { cwd: srcTauri },
      );
      await run(["xcrun", "stapler", "staple", dmgOut], { cwd: srcTauri });
      console.log(`\n[tauri] Notarized + stapled dmg: ${dmgOut}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } else {
    console.log("[tauri] No Apple API key in env — dmg left un-notarized.");
  }

  return dmgOut;
}

/**
 * Pack a staged bundle directory into one self-extracting executable.
 *
 * Mechanism: tar the staged tree (host `tar`), then generate a tiny bootstrap
 * `.ts` that embeds the tarball as a `bun --compile` embedded asset. On first
 * run the bootstrap extracts the tarball to a content-addressed cache dir
 * (`<cache>/equin-release/<hash>/`), restores exec bits on the binaries (tar
 * preserves modes), then exec's the extracted `launch`. Subsequent runs skip
 * extraction if the dir is already populated.
 *
 * Returns the path to the compiled single-file binary.
 */
async function packStagedTree(opts: {
  stagedDir: string;
  root: string;
  composition: string;
  target: string;
  platform: PlatformTag;
}): Promise<string> {
  const { stagedDir, root, composition, target, platform } = opts;

  // tar the staged tree. -C <staged> . so the archive root holds the bundle
  // contents directly (launch, server, gateway/, …) with no leading dir.
  //
  // The archive itself is platform-agnostic, with one host nit: macOS bsdtar
  // writes SCHILY.xattr.com.apple.provenance pax headers, which perturb the
  // sha256 that keys the extraction cache dir below. Both flags are needed —
  // neither strips it alone. This is a HOST condition (whose tar is writing the
  // archive), not a target one.
  const tarPath = join(dirname(stagedDir), `.${composition}-${platform}.tar`);
  rmSync(tarPath, { force: true });
  console.log("  • tar staged tree");
  await run([
    "tar",
    "-cf",
    tarPath,
    ...(process.platform === "darwin"
      ? ["--no-xattrs", "--no-mac-metadata"]
      : []),
    "-C",
    stagedDir,
    ".",
  ]);

  // Content hash of the tarball → cache dir key (stable across identical builds).
  const tarBytes = await Bun.file(tarPath).arrayBuffer();
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(tarBytes);
  const hash = hasher.digest("hex").slice(0, 16);

  // Generate the bootstrap entry. The tarball is embedded via an import-with-type
  // attribute so `bun --compile` bakes it into the binary; at runtime the import
  // resolves to a file path inside the standalone executable's virtual FS.
  const bootstrapPath = join(
    dirname(stagedDir),
    `.bootstrap-${composition}-${process.pid}.ts`,
  );
  const bootstrap = `
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tarball from ${JSON.stringify(tarPath)} with { type: "file" };

const HASH = ${JSON.stringify(hash)};
// Cache root for the extracted bundle: an explicit override wins, then the XDG
// cache dir if the operator set one, else the OS temp dir (always writable).
// Deliberately home-directory-agnostic — the launcher self-roots its DATA under
// the extracted dir regardless, so the self-extractor needs no user-home lookup.
const baseCache =
  process.env.EQUIN_RELEASE_DIR ??
  process.env.XDG_CACHE_HOME ??
  tmpdir();
const extractDir = join(baseCache, "equin-release", ${JSON.stringify(
    composition,
  )} + "-" + HASH);
const launchBin = join(extractDir, "launch");

if (!existsSync(launchBin)) {
  mkdirSync(extractDir, { recursive: true });
  // tar preserves the exec bits set on the staged binaries, so no chmod pass is
  // needed. Bun.embeddedFiles exposes the embedded tarball as a Blob; write it
  // to a temp file the host tar can read, then extract.
  const tmpTar = join(extractDir, ".bundle.tar");
  const bytes = new Uint8Array(await Bun.file(tarball).arrayBuffer());
  await Bun.write(tmpTar, bytes);
  const res = spawnSync("tar", ["-xf", tmpTar, "-C", extractDir], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    throw new Error("release: failed to extract bundle (tar exit " + res.status + ")");
  }
}

// Hand off to the extracted launcher; inherit stdio + env, replace this process.
const child = spawnSync(launchBin, process.argv.slice(2), { stdio: "inherit" });
process.exit(child.status ?? 1);
`;
  writeFileSync(bootstrapPath, bootstrap);

  // The shippable binary lives INSIDE <out> (under dist/) so the run dir is
  // self-contained — the tar + bootstrap temp files stay siblings of stagedDir
  // (created before the tar runs, cleaned up below).
  const binaryName = `${composition}-${target}-${platform}`;
  const distDir = join(stagedDir, "dist");
  mkdirSync(distDir, { recursive: true });
  const binaryPath = join(distDir, binaryName);

  try {
    console.log("  • compile self-extracting binary");
    // This is the SHIPPED binary, so it takes the target explicitly: without it
    // a cross-build produces a Mach-O self-extractor wrapping a linux payload.
    // (`bun build` takes the CLI flag form of the same target string.)
    await run(
      [
        "bun",
        "build",
        "--compile",
        bootstrapPath,
        "--outfile",
        binaryPath,
        `--target=${bunCompileTarget(platform)}`,
      ],
      { cwd: root },
    );
  } finally {
    rmSync(bootstrapPath, { force: true });
    rmSync(tarPath, { force: true });
  }

  return binaryPath;
}
