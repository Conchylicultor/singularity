import type { Command } from "commander";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { asFsPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { buildPluginTree, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  compositionsConfig,
  manifestItemToManifest,
} from "@plugins/plugin-meta/plugins/composition/core";
import { resolveIconSvgNodes } from "@plugins/primitives/plugins/icon-picker/server";
import { appIconToSvg } from "@plugins/apps-core/plugins/app-icon/core";

// ── Staged bundle layout (the `--dev` output, also the pack input) ────────────
//
//   <out>/
//     launch                       compiled launcher binary (entrypoint)
//     server                       compiled backend binary (gateway spawns this)
//     gateway/gateway              prebuilt Go gateway binary
//     pg/pg-start                  compiled embedded-PG start binary
//     pg/native/...                vendored embedded-postgres native tree
//     pgbouncer/pgbouncer-start    compiled PgBouncer start binary
//     pgbouncer/native/bin/pgbouncer  vendored PgBouncer native binary
//     web/                         filtered Vite dist (served statically)
//     RELEASE.json                 { composition, target, platform, builtAt, port }
//
// `launch` self-roots SINGULARITY_DIR under <out>/data and points the start
// binaries at the vendored natives via env, so the bundle is fully isolated.

const DEFAULT_PORT = 9100;

const SERVER_ENTRY =
  "plugins/framework/plugins/server-core/bin/index.ts";
const LAUNCH_ENTRY =
  "plugins/infra/plugins/launcher/bin/launch.ts";
const PG_START_ENTRY =
  "plugins/database/plugins/embedded/scripts/start.ts";
const PGBOUNCER_START_ENTRY =
  "plugins/database/plugins/pgbouncer/scripts/start.ts";
// Tauri-only: the desktop shell runs this on app exit to stop the detached
// gateway + PG daemons it brought up via `launch`. The web self-extractor has
// no host process to drive teardown, so it ships no teardown binary.
const TEARDOWN_ENTRY = "plugins/infra/plugins/launcher/bin/teardown.ts";

// The filtered registry the compiled backend's `@composition-server-registry`
// alias is repointed at, so the bundler's closure IS the composition closure.
const FILTERED_SERVER_REGISTRY =
  "plugins/framework/plugins/server-core/core/server.composition.generated.ts";
const FILTERED_WEB_REGISTRY =
  "plugins/framework/plugins/web-sdk/core/web.composition.generated.ts";

function platformTag(): string {
  const mapping: Record<string, Record<string, string>> = {
    darwin: { arm64: "darwin-arm64", x64: "darwin-x64" },
    linux: { arm64: "linux-arm64", x64: "linux-x64" },
  };
  const tag = mapping[process.platform]?.[process.arch];
  if (!tag) {
    throw new Error(
      `release: unsupported platform ${process.platform}/${process.arch}`,
    );
  }
  return tag;
}

async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<void> {
  console.log(`  $ ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Command failed (exit ${code}): ${cmd.join(" ")}`);
  }
}

/** Rasterize an SVG string to a PNG at `size`×`size` (pure-Wasm, no native deps). */
function renderPng(svg: string, size = 512): Uint8Array {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
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

  // Each entry point (e.g. "apps.sonata") is a dotted plugin id; its tree node is
  // keyed by the fs-path encoding ("apps/plugins/sonata") in `byPath`.
  for (const entry of entryPoints) {
    const node = tree.byPath.get(asFsPath(asPluginId(entry)));
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
 */
async function compile(opts: {
  entry: string;
  outfile: string;
  root: string;
  aliasOverride?: { alias: string; target: string };
}): Promise<void> {
  const { entry, outfile, root, aliasOverride } = opts;
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
    compile: { outfile },
    plugins,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error(`bun build --compile failed for ${entry}`);
  }
}

/** Resolve the embedded-postgres native dir for the host platform. */
function embeddedNativeDir(root: string): string {
  const tag = platformTag();
  const dir = join(
    root,
    "plugins/database/plugins/embedded/node_modules",
    `@embedded-postgres/${tag}`,
    "native",
  );
  if (!existsSync(dir)) {
    throw new Error(
      `release: embedded-postgres native dir not found at ${dir}; run \`bun install\` first`,
    );
  }
  return dir;
}

/** Resolve the PgBouncer native binary for the host platform. */
function pgbouncerNativeBin(root: string): string {
  const tag = platformTag();
  const bin = join(
    root,
    "plugins/database/plugins/pgbouncer/node_modules",
    `@equin/pgbouncer-${tag}`,
    "native/bin/pgbouncer",
  );
  if (!existsSync(bin)) {
    throw new Error(
      `release: pgbouncer native binary not found at ${bin}; run \`bun install\` first`,
    );
  }
  return bin;
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
      "Output directory (default: dist/release/<name>-<target>-<timestamp>)",
    )
    .option(
      "--port <port>",
      "Listen port baked into RELEASE.json",
      String(DEFAULT_PORT),
    )
    .action(
      async (opts: {
        composition: string;
        target: string;
        dev?: boolean;
        out?: string;
        port: string;
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

        const platform = platformTag();
        const out =
          opts.out ??
          join(
            root,
            "dist/release",
            `${opts.composition}-${opts.target}-${Date.now()}`,
          );

        console.log(`Releasing composition "${opts.composition}" (${platform})`);
        console.log(`  Output: ${out}`);

        // ── 1. Composition build (reuse the F1 build pipeline) ───────────────
        // Shell out to the build command so we reuse migrations + web build +
        // codegen verbatim. `--no-restart` (no gateway to restart) and
        // `--skip-checks` (a release build is downstream of checks; the staged
        // closure is what we verify). `--allow-main` so a release can be cut
        // from the main worktree too.
        console.log("\n[1/5] Building composition (filtered registries + web dist)...");
        await run(
          [
            "bun",
            join(root, "plugins/framework/plugins/cli/bin/index.ts"),
            "build",
            "--composition",
            opts.composition,
            "--no-restart",
            "--skip-checks",
            "--allow-main",
          ],
          { cwd: root },
        );

        const filteredServerReg = join(root, FILTERED_SERVER_REGISTRY);
        const filteredWebReg = join(root, FILTERED_WEB_REGISTRY);
        if (!existsSync(filteredServerReg)) {
          console.error(
            `Composition build did not produce ${FILTERED_SERVER_REGISTRY}. Is "${opts.composition}" a known composition?`,
          );
          process.exit(1);
        }
        if (!existsSync(filteredWebReg)) {
          console.error(
            `Composition build did not produce ${FILTERED_WEB_REGISTRY}.`,
          );
          process.exit(1);
        }

        // `dist` is a symlink → dist.live.<pid>; follow it to the real tree.
        const webDistLink = join(
          root,
          "plugins/framework/plugins/web-core/dist",
        );
        if (!existsSync(webDistLink)) {
          console.error(`Web dist not found at ${webDistLink}.`);
          process.exit(1);
        }
        const webDistReal = realpathSync(webDistLink);

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
        });

        console.log("  • pg-start");
        await compile({
          entry: PG_START_ENTRY,
          outfile: join(out, "pg", "pg-start"),
          root,
        });

        console.log("  • pgbouncer-start");
        await compile({
          entry: PGBOUNCER_START_ENTRY,
          outfile: join(out, "pgbouncer", "pgbouncer-start"),
          root,
        });

        if (opts.target === "tauri") {
          console.log("  • teardown (desktop exit hook)");
          await compile({
            entry: TEARDOWN_ENTRY,
            outfile: join(out, "teardown"),
            root,
          });
        }

        // ── 3. Vendor native binaries + web dist ─────────────────────────────
        console.log("\n[3/5] Vendoring native binaries + web dist...");

        // Gateway: build it (forced) so the bundle ships a fresh prebuilt.
        console.log("  • gateway (go build)");
        const gatewayDir = join(root, "gateway");
        await run(["go", "build", "-o", "gateway", "."], { cwd: gatewayDir });
        mkdirSync(join(out, "gateway"), { recursive: true });
        cpSync(join(gatewayDir, "gateway"), join(out, "gateway", "gateway"));

        // Embedded PG: copy the whole native/ tree (bin + lib + symlink manifest).
        console.log("  • embedded-postgres native tree");
        cpSync(embeddedNativeDir(root), join(out, "pg", "native"), {
          recursive: true,
        });

        // PgBouncer: copy the single native binary.
        console.log("  • pgbouncer native binary");
        mkdirSync(join(out, "pgbouncer", "native", "bin"), { recursive: true });
        cpSync(
          pgbouncerNativeBin(root),
          join(out, "pgbouncer", "native", "bin", "pgbouncer"),
        );

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
        };
        writeFileSync(
          join(out, "RELEASE.json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );

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
          console.log("\nRun it (self-roots SINGULARITY_DIR under <out>/data):");
          console.log(`  ${join(out, "launch")}`);
          console.log(`\nThen: http://${opts.composition}.localhost:${port}`);
          return;
        }

        // ── 5. Pack into a single self-extracting binary ─────────────────────
        console.log("\n[4/5] Packing staged tree into a self-extracting binary...");
        const binaryPath = await packStagedTree({
          stagedDir: out,
          root,
          composition: opts.composition,
          target: opts.target,
          platform,
        });

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
      throw new Error(`release: tauri icon did not produce ${f} in ${iconsDir}`);
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
    console.log("\n[tauri] Running tauri build --bundles app (host platform)...");
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

    console.log("\n[done] Tauri desktop bundle built. Artifacts:");
    console.log(
      `  ${join(srcTauri, "target/release/bundle/macos", `${productName}.app`)}`,
    );
    console.log(`  ${dmgPath}`);
    return;
  }

  console.log("\n[tauri] Running tauri build (host platform)...");
  await run(["bun", "x", "@tauri-apps/cli@2", "build", "--config", overridePath], {
    cwd: tauriDir,
  });

  console.log("\n[done] Tauri desktop bundle built. Artifacts under:");
  console.log(`  ${join(srcTauri, "target", "release", "bundle")}`);
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

  // Generated, gitignored appdmg spec (mirrors tauri.conf.override.json).
  const spec = {
    title: productName,
    icon: icnsPath,
    window: { size: { width: 540, height: 380 } },
    contents: [
      { x: 140, y: 200, type: "file", path: appPath },
      { x: 400, y: 200, type: "link", path: "/Applications" },
    ],
  };
  const specPath = join(srcTauri, "appdmg.spec.json");
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");

  // appdmg refuses to overwrite an existing dmg, so clear it for idempotent re-runs.
  rmSync(dmgOut, { force: true });

  console.log("\n[tauri] Packaging dmg headlessly (appdmg)...");
  await run(["bun", "x", "appdmg@0.6.6", specPath, dmgOut], { cwd: srcTauri });

  console.log(`\n[tauri] Packaged dmg: ${dmgOut}`);
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
  platform: string;
}): Promise<string> {
  const { stagedDir, root, composition, target, platform } = opts;

  // tar the staged tree. -C <staged> . so the archive root holds the bundle
  // contents directly (launch, server, gateway/, …) with no leading dir.
  const tarPath = join(dirname(stagedDir), `.${composition}-${platform}.tar`);
  rmSync(tarPath, { force: true });
  console.log("  • tar staged tree");
  await run(["tar", "-cf", tarPath, "-C", stagedDir, "."]);

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

  const binaryName = `${composition}-${target}-${platform}`;
  const binaryPath = join(dirname(stagedDir), binaryName);

  try {
    console.log("  • compile self-extracting binary");
    await run(
      [
        "bun",
        "build",
        "--compile",
        bootstrapPath,
        "--outfile",
        binaryPath,
      ],
      { cwd: root },
    );
  } finally {
    rmSync(bootstrapPath, { force: true });
    rmSync(tarPath, { force: true });
  }

  return binaryPath;
}
