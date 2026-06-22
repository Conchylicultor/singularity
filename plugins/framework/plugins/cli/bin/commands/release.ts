import type { Command } from "commander";
import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";

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

        if (opts.target !== "web") {
          console.error(
            `Unsupported --target "${opts.target}". Only "web" is supported; the "tauri" target is F5 (not yet implemented).`,
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

        // ── 4. --dev: stop at the staged dir ─────────────────────────────────
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
