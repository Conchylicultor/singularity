import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);

function platformPackage(): string {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "@embedded-postgres/darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "@embedded-postgres/darwin-x64";
  if (platform === "linux" && arch === "x64") return "@embedded-postgres/linux-x64";
  if (platform === "linux" && arch === "arm64") return "@embedded-postgres/linux-arm64";
  throw new Error(`Unsupported platform for embedded Postgres: ${platform}-${arch}`);
}

let cachedPkgRoot: string | null = null;

function pkgRoot(): string {
  if (cachedPkgRoot) return cachedPkgRoot;
  const pkg = platformPackage();
  const pkgJson = require.resolve(`${pkg}/package.json`);
  cachedPkgRoot = pkgJson.replace(/\/package\.json$/, "");
  return cachedPkgRoot;
}

function binDir(): string {
  const dir = join(pkgRoot(), "native", "bin");
  if (!existsSync(dir)) {
    throw new Error(
      `Embedded PG bin dir not found at ${dir}. Did \`bun install\` complete?`,
    );
  }
  return dir;
}

let symlinksEnsured = false;

/**
 * The embedded-postgres tarballs ship versioned dylibs (e.g.
 * `libicudata.77.1.dylib`) but PG's runtime loader looks for unversioned /
 * minor-versioned aliases (e.g. `libicudata.77.dylib`). The manifest at
 * `native/pg-symlinks.json` enumerates the aliases — npm doesn't preserve
 * symlinks across tarball install, so we recreate them on first use.
 *
 * Idempotent: skips if the link already exists.
 */
export function ensurePgSymlinks(): void {
  if (symlinksEnsured) return;
  const root = pkgRoot();
  const manifestPath = join(root, "native", "pg-symlinks.json");
  if (!existsSync(manifestPath)) {
    symlinksEnsured = true;
    return;
  }
  const entries = JSON.parse(readFileSync(manifestPath, "utf8")) as Array<{
    source: string;
    target: string;
  }>;
  for (const e of entries) {
    const linkPath = join(root, e.target);
    if (existsSync(linkPath)) continue;
    // `source` is repo-relative; symlinks must point at the basename so
    // they resolve relative to their own directory at load time.
    try {
      symlinkSync(basename(e.source), linkPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  symlinksEnsured = true;
}

/**
 * Bundled PG binaries shipped by `embedded-postgres`. The package only
 * ships the server-side trio — `pg_isready`, `pg_dump`, `pg_restore`,
 * `pg_dumpall`, and `psql` are NOT bundled. We use direct `pg.Client`
 * connections instead of `pg_isready`/`psql`, and rely on PATH-resolved
 * system tools for `pg_dump`/`pg_restore` until we ship our own bundle.
 */
export type PgBinName = "postgres" | "initdb" | "pg_ctl";

/**
 * Resolve an absolute path to the named PG binary bundled by
 * `@embedded-postgres/<platform>`. Lazily creates the dylib symlinks
 * the binaries need at runtime.
 */
export function pgBin(name: PgBinName): string {
  ensurePgSymlinks();
  return join(binDir(), name);
}
