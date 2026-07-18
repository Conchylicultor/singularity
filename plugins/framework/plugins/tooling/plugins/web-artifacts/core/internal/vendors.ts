// Vendor pre-bundler: ONE esbuild build with every needed bare npm specifier as
// an entry point and `splitting: true` — the same mechanics as Vite's
// `optimizeDeps`. Shared transitive modules (react internals, scheduler, …)
// land in shared chunks imported relatively, so module identity is preserved
// across all vendor entries WITHOUT trying to externalize CJS `require()`
// (which esbuild can only turn into a browser-fatal runtime `__require`).
//
// CJS entries get an explicit named-export wrapper (enumerated with
// `cjs-module-lexer`, the same parser Node uses for its CJS named-exports
// interop); ESM entries get a plain `export *` (+ `default` when present).
//
// Content-addressing: the SET is the unit — keyed by every entry's resolved
// package version + wrapper + esbuild version + flags. Lazy: rebuilt only when
// the key changes (a new dep, a version bump, a flag change).

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { init as cjsInit, parse as cjsParse } from "cjs-module-lexer";
import { init as esInit, parse as esParse } from "es-module-lexer";
import * as esbuild from "esbuild";
import { sha256Hex } from "../hash";
import { WEB_ARTIFACTS_DIR } from "./store";

const VENDORS_ROOT = join(WEB_ARTIFACTS_DIR, "vendors");

export interface VendorSpecRequest {
  specifier: string;
  /** A directory that can resolve the specifier (an importing plugin's dir). */
  resolveDir: string;
}

export interface VendorSetMeta {
  /** specifier → entry file name (relative to the vendor set dir). */
  entries: Record<string, string>;
  /** file → its static import specifiers (relative chunks; used for preloads). */
  imports: Record<string, string[]>;
  setHash: string;
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Resolve a bare specifier to its entry file with esbuild's own resolver. */
async function resolveSpec(spec: string, resolveDir: string): Promise<string> {
  let resolved: string | null = null;
  let errorText: string | null = null;
  await esbuild.build({
    stdin: { contents: `import ${JSON.stringify(spec)};`, resolveDir },
    bundle: true,
    write: false,
    platform: "browser",
    logLevel: "silent",
    plugins: [
      {
        name: "capture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, async (args) => {
            if (args.pluginData === "probe") return undefined;
            if (args.path !== spec) return { external: true };
            const r = await b.resolve(args.path, {
              resolveDir: args.resolveDir,
              kind: args.kind,
              pluginData: "probe",
            });
            resolved = r.path;
            errorText = r.errors.map((e) => e.text).join("; ") || null;
            return { external: true };
          });
        },
      },
    ],
  });
  if (!resolved) {
    throw new Error(
      `vendor: cannot resolve "${spec}" from ${resolveDir}${errorText ? `: ${errorText}` : ""}`,
    );
  }
  return resolved;
}

function nearestPackageJson(file: string): { dir: string; version: string; type?: string } {
  let dir = dirname(file);
  while (dir !== dirname(dir)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      const parsed = JSON.parse(readFileSync(pj, "utf8")) as { version?: string; type?: string };
      // Some packages nest extension-less "directory package.json" files
      // ({"type":"module"} markers) without a version — keep walking up.
      if (parsed.version !== undefined) {
        return { dir, version: parsed.version, type: parsed.type };
      }
    }
    dir = dirname(dir);
  }
  throw new Error(`vendor: no package.json with a version above ${file}`);
}

/**
 * Classify the resolved entry's module format. Extension first; then SYNTAX
 * (an `exports`/static-`import` construct proves ESM — many packages ship an
 * ESM "module"-field entry as `.js` inside a `type`-less package.json, where
 * Node's package.json rule would misread it as CJS); nearest package.json
 * `type` only as the tiebreaker for syntax-less files (e.g. UMD).
 */
function moduleFormatOf(file: string): "esm" | "cjs" {
  if (file.endsWith(".mjs") || file.endsWith(".mts")) return "esm";
  if (file.endsWith(".cjs") || file.endsWith(".cts")) return "cjs";
  try {
    const [imports, exports] = esParse(readFileSync(file, "utf8"), file);
    if (exports.length > 0 || imports.some((i) => i.d === -1 && i.n !== undefined)) {
      return "esm";
    }
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    // Lexer choked (exotic syntax) — fall through to the package.json rule.
  }
  let dir = dirname(file);
  while (dir !== dirname(dir)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      // Nearest package.json governs (Node semantics): absent "type" ⇒ CJS.
      const parsed = JSON.parse(readFileSync(pj, "utf8")) as { type?: string };
      return parsed.type === "module" ? "esm" : "cjs";
    }
    dir = dirname(dir);
  }
  return "cjs";
}

/** Enumerate a CJS module's named exports, following relative re-export chains. */
function cjsNamedExports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const { exports, reexports } = cjsParse(readFileSync(file, "utf8"));
  const names = new Set(exports);
  for (const re of reexports) {
    if (!re.startsWith(".")) continue; // bare re-export target: names unknowable statically
    let target = join(dirname(file), re);
    for (const cand of [target, `${target}.js`, `${target}.cjs`, join(target, "index.js")]) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        target = cand;
        break;
      }
    }
    if (existsSync(target) && statSync(target).isFile()) {
      for (const n of cjsNamedExports(target, seen)) names.add(n);
    }
  }
  names.delete("default");
  names.delete("__esModule");
  return names;
}

async function esmHasDefaultExport(file: string): Promise<boolean> {
  await esInit;
  const [, exports] = esParse(readFileSync(file, "utf8"), file);
  return exports.some((e) => e.n === "default");
}

/** File name for a vendor entry inside the set dir. */
export function vendorEntryFileName(spec: string): string {
  return `${spec.replaceAll("/", "__").replaceAll("@", "")}.js`;
}

interface ResolvedVendor {
  spec: string;
  resolveDir: string;
  entryFile: string;
  version: string;
  cjs: boolean;
  wrapper: string;
}

async function resolveVendors(requests: VendorSpecRequest[]): Promise<ResolvedVendor[]> {
  await cjsInit();
  await esInit;
  const out: ResolvedVendor[] = [];
  for (const req of requests) {
    if (req.specifier.endsWith(".css")) {
      throw new Error(
        `vendor: CSS specifier "${req.specifier}" reached the vendor set — package CSS must be ` +
          `bundled into its importing artifact (externals rule regression).`,
      );
    }
    try {
      const entryFile = await resolveSpec(req.specifier, req.resolveDir);
      const { version } = nearestPackageJson(entryFile);
      const cjs = moduleFormatOf(entryFile) === "cjs";
      let wrapper: string;
      if (cjs) {
        // Named RE-EXPORTS (not `const {…} = default`): esbuild rewrites each to
        // an interop property access that works for BOTH plain CJS
        // (`module.exports.X`) and `__esModule`-marked transpiled packages
        // (whose interop default is `exports.default` — possibly undefined, e.g.
        // @tonejs/midi — so destructuring the default import would crash).
        const names = [...cjsNamedExports(entryFile)].filter((n) => IDENT_RE.test(n)).sort();
        wrapper =
          (names.length > 0
            ? `export { ${names.join(", ")} } from ${JSON.stringify(req.specifier)};\n`
            : "") + `export { default } from ${JSON.stringify(req.specifier)};\n`;
      } else {
        wrapper =
          `export * from ${JSON.stringify(req.specifier)};\n` +
          ((await esmHasDefaultExport(entryFile))
            ? `export { default } from ${JSON.stringify(req.specifier)};\n`
            : "");
      }
      out.push({ spec: req.specifier, resolveDir: req.resolveDir, entryFile, version, cjs, wrapper });
    } catch (err) {
      throw new Error(
        `vendor: failed to prepare "${req.specifier}" (from ${req.resolveDir}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }
  }
  out.sort((a, b) => (a.spec < b.spec ? -1 : 1));
  return out;
}

export function vendorSetDirName(setHash: string): string {
  return `set.${setHash.slice(0, 16)}`;
}

export function vendorSetPath(setHash: string): string {
  return join(VENDORS_ROOT, vendorSetDirName(setHash));
}

/**
 * Resolve the vendor set's content key WITHOUT building: each request's entry
 * file, package version, module format, and interop wrapper, hashed into the
 * set's store key. Shared by `ensureVendorSet` and the map-in-sync check (which
 * recomputes the expected set hash and reads the stored meta).
 */
export async function resolveVendorSet(opts: {
  requests: VendorSpecRequest[];
  minify: boolean;
  builderVersion: number;
  /** Builder own-source digest — vendor semantics live in this plugin's code. */
  builderSource: string;
}): Promise<{ resolved: ResolvedVendor[]; setHash: string }> {
  const resolved = await resolveVendors(opts.requests);
  const setHash = sha256Hex(
    JSON.stringify({
      v: opts.builderVersion,
      src: opts.builderSource,
      minify: opts.minify,
      esbuild: esbuild.version,
      entries: resolved.map((r) => [r.spec, r.version, r.cjs, r.wrapper]),
    }),
  );
  return { resolved, setHash };
}

/** Read a vendor set's stored meta, or null when the set is not in the store. */
export function readVendorSetMeta(setHash: string): VendorSetMeta | null {
  const metaFile = join(vendorSetPath(setHash), "meta.json");
  if (!existsSync(metaFile)) return null;
  return JSON.parse(readFileSync(metaFile, "utf8")) as VendorSetMeta;
}

/**
 * Ensure the vendor set for `requests` exists in the store; build it if the
 * content key misses. Returns the set metadata (entry-file map for the import
 * map + per-file imports for modulepreload).
 */
export async function ensureVendorSet(opts: {
  requests: VendorSpecRequest[];
  minify: boolean;
  builderVersion: number;
  builderSource: string;
}): Promise<VendorSetMeta> {
  const { resolved, setHash } = await resolveVendorSet(opts);
  const dest = vendorSetPath(setHash);
  const metaFile = join(dest, "meta.json");
  if (existsSync(metaFile)) {
    const now = new Date();
    utimesSync(dest, now, now);
    return JSON.parse(readFileSync(metaFile, "utf8")) as VendorSetMeta;
  }

  mkdirSync(VENDORS_ROOT, { recursive: true });
  const tmpDir = join(VENDORS_ROOT, `.tmp.${setHash.slice(0, 16)}.${process.pid}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Virtual entries: `vendor-entry:<spec>` loads the wrapper with the request's
  // own resolveDir, so plugin-local deps resolve under bun's isolated installs.
  const bySpec = new Map(resolved.map((r) => [r.spec, r] as const));
  const result = await esbuild.build({
    entryPoints: resolved.map((r) => ({
      in: `vendor-entry:${r.spec}`,
      out: vendorEntryFileName(r.spec).replace(/\.js$/, ""),
    })),
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    outdir: tmpDir,
    chunkNames: "chunks/[name]-[hash]",
    minify: opts.minify,
    keepNames: true,
    sourcemap: true,
    metafile: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "silent",
    plugins: [
      {
        name: "vendor-entries",
        setup(b) {
          b.onResolve({ filter: /^vendor-entry:/ }, (args) => ({
            path: args.path,
            namespace: "vendor-entry",
          }));
          b.onLoad({ filter: /.*/, namespace: "vendor-entry" }, (args) => {
            const spec = args.path.slice("vendor-entry:".length);
            const r = bySpec.get(spec);
            if (!r) throw new Error(`vendor: unknown virtual entry ${args.path}`);
            return { contents: r.wrapper, loader: "js", resolveDir: r.resolveDir };
          });
        },
      },
    ],
  });
  if (result.errors.length > 0) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`vendor build failed: ${result.errors.map((e) => e.text).join("\n")}`);
  }

  // Per-file static imports (for the modulepreload closure). Relative to set dir.
  await esInit;
  const imports: Record<string, string[]> = {};
  for (const dirent of readdirSync(tmpDir, { recursive: true, withFileTypes: true })) {
    if (!dirent.isFile() || !dirent.name.endsWith(".js")) continue;
    const abs = join(dirent.parentPath, dirent.name);
    const rel = relative(tmpDir, abs);
    const [fileImports] = esParse(readFileSync(abs, "utf8"), rel);
    imports[rel] = [...new Set(fileImports.filter((i) => i.n !== undefined && i.d === -1).map((i) => i.n!))].sort();
  }

  const meta: VendorSetMeta = {
    entries: Object.fromEntries(resolved.map((r) => [r.spec, vendorEntryFileName(r.spec)])),
    imports,
    setHash,
  };
  writeFileSync(join(tmpDir, "meta.json"), JSON.stringify(meta, null, 2));
  try {
    renameSync(tmpDir, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY" && code !== "EPERM") throw err;
    rmSync(tmpDir, { recursive: true, force: true }); // concurrent identical build won
  }
  return meta;
}

// Pruning bounds — same policy as the artifact store (age, then count). A vendor
// set is one esbuild split build of every external package, so it is BIG (~48 MB
// measured) while the live population is tiny (13 sets in 14 days). Age is the
// evictor that matters; the count is a disk backstop sized well clear of the
// working set, bounding the dir at ~2.3 GB worst case.
const VENDORS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const VENDORS_MAX_ENTRIES = 48;
const VENDORS_TRIM_TO = 32;

/** Prune aged vendor sets, then cap total count (same policy as the artifact store). */
export function pruneVendorSets(): void {
  if (!existsSync(VENDORS_ROOT)) return;
  const now = Date.now();
  const live: { path: string; mtimeMs: number }[] = [];
  for (const name of readdirSync(VENDORS_ROOT)) {
    const p = join(VENDORS_ROOT, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(p).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue;
    }
    // Leftover temp dirs from crashed builds age out at 1h regardless.
    const maxAge = name.startsWith(".tmp.") ? 60 * 60 * 1000 : VENDORS_MAX_AGE_MS;
    if (now - mtimeMs > maxAge) {
      rmSync(p, { recursive: true, force: true });
    } else if (!name.startsWith(".tmp.")) {
      live.push({ path: p, mtimeMs });
    }
  }
  if (live.length > VENDORS_MAX_ENTRIES) {
    live.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
    for (const { path } of live.slice(0, live.length - VENDORS_TRIM_TO)) {
      rmSync(path, { recursive: true, force: true });
    }
  }
}
