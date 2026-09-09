import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

/**
 * Syncing a release bundle's resolved config origins onto a host's config dir.
 *
 * Split out of `boot.ts` so it can be tested on nothing but a temp directory:
 * this module reaches `node:fs`/`node:path`/`node:crypto` and nothing else, so a
 * test never drags in the gateway, the DB or the paths runtime. `boot.ts` owns
 * the one thing that IS environment — which two directories these are.
 */

/**
 * The `// @hash <digest>` header every propagated config document carries on
 * line 1. Read here rather than imported because the launcher must type-check
 * under the DOM-free `tools` tsconfig, where the `config_v2` barrels (which
 * reach `fields/core` → React types) are out of bounds — the same constraint
 * that makes `@plugins/config_v2/data-dirs` the one config_v2 module the
 * launcher may reach. The header grammar is an on-disk contract, identical in
 * both layers.
 */
const HASH_HEADER_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

/** The build-owned layer. Everything else under a config dir is the user's. */
const ORIGIN_SUFFIX = ".origin.jsonc";
/** The transient three-way-merge base, captured at the conflict transition. */
const ANCESTOR_SUFFIX = ".ancestor.jsonc";

/**
 * The `// @hash` header of a config file, or null when the file is absent or
 * carries no readable header. Null is a real answer here, not a swallowed error:
 * the header is only ever consulted to decide whether to capture an ancestor
 * snapshot, so an unreadable one costs the settings UI its three-way Merge and
 * nothing else — the origin is still refreshed and the override still stands.
 * Refusing to boot a deployed app over a corrupt USER file would trade a
 * cosmetic loss for a downed site.
 */
function hashHeaderOf(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return HASH_HEADER_RE.exec(readFileSync(filePath, "utf-8"))?.[1] ?? null;
}

/** Replace `filePath`'s bytes atomically, creating its directory. */
function writeFileAtomic(filePath: string, bytes: string): void {
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  mkdirSync(dirname(filePath), { recursive: true });
  try {
    writeFileSync(tmp, bytes, "utf-8");
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch (unlinkErr: unknown) {
      if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT")
        throw unlinkErr;
    }
    throw err;
  }
}

/** Every `*.origin.jsonc` under `dir`, as forward-slash paths relative to it. */
function listOriginFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listOriginFiles(dir, childRel));
    else if (entry.name.endsWith(ORIGIN_SUFFIX)) out.push(childRel);
  }
  return out;
}

/** Drop directories left empty by the prune, deepest first. */
function removeEmptyDirsUnder(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    removeEmptyDirsUnder(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}

/**
 * Bring `destDir`'s build-owned config layer in line with `srcDir`'s, and touch
 * nothing else.
 *
 * **Only the origin layer moves.** config_v2's three-layer model already says
 * who owns what: `<name>.origin.jsonc` is propagated (build-owned, rewritten
 * every build) and `<name>.jsonc` is the user's own override (never clobbered).
 * The release path used to collapse both into a single directory-level
 * copy-if-absent, so a data dir that survived one deploy froze the entire config
 * layer at whatever the FIRST bundle installed. Every config committed after
 * that shipped inside the bundle and was then ignored, silently: a per-app scope
 * that never materialized reads as "no scope", and a reorder directive naming a
 * contribution that no longer exists just falls back to load order. Nothing
 * fails; the deployed app is merely a different app than the one that was built.
 *
 * The write rule mirrors `propagate()` (config_v2's `tier-logic`) exactly,
 * including its ancestor snapshot: an override still in sync with the origin on
 * disk that this bundle's origin would make stale gets that old origin preserved
 * beside it as `<name>.ancestor.jsonc`, so the settings UI can still offer a
 * three-way Merge. Each seed file was itself written BY `propagate` — its
 * `// @hash` is the hash of its own body — so copying it verbatim is byte-for-byte
 * what `propagate` would write here, and comparing the two headers is exactly its
 * staleness predicate. No hashing and no precedence rule is re-implemented:
 * resolution happened at build time, where the dev toolchain is.
 *
 * An origin `srcDir` does not carry is removed, so that a per-app scope deleted
 * from version control reverts to base instead of living onforever — the mirror
 * image of the bug above. With ONE exception, taken verbatim from
 * `propagateConfigToUser`: an origin with a sibling `<name>.jsonc` is a runtime
 * user fork, whose origin the app itself wrote when the user first customized
 * that scope. That is per-user state, not stale propagation, and deleting it
 * would strand the override beside it. User-owned files are themselves never
 * removed, so a directory still holding one survives.
 *
 * Returns what it did, for the caller's boot log.
 */
export function propagateOriginLayer(
  srcDir: string,
  destDir: string,
): { written: number; removed: number } {
  const shipped = new Set(listOriginFiles(srcDir));
  let written = 0;

  for (const rel of shipped) {
    const segments = rel.split("/");
    const from = join(srcDir, ...segments);
    const to = join(destDir, ...segments);
    const bytes = readFileSync(from, "utf-8");
    if (existsSync(to) && readFileSync(to, "utf-8") === bytes) continue;

    // Snapshot the merge base BEFORE overwriting, at the same transition
    // `propagate()` captures: the override is still in sync with the origin on
    // disk (`oldOrigin.hash === override.hash`) and this bundle's origin will
    // make it stale (`override.hash !== newHash`). Idempotent for the reason it
    // is there — once the override is stale the hashes differ, so a later boot
    // never clobbers the true base with an intermediate origin.
    const stem = to.slice(0, -ORIGIN_SUFFIX.length);
    const overrideHash = hashHeaderOf(`${stem}.jsonc`);
    const oldOriginHash = hashHeaderOf(to);
    const newHash = HASH_HEADER_RE.exec(bytes)?.[1] ?? null;
    if (
      overrideHash !== null &&
      oldOriginHash === overrideHash &&
      overrideHash !== newHash
    ) {
      writeFileAtomic(`${stem}${ANCESTOR_SUFFIX}`, readFileSync(to, "utf-8"));
    }

    writeFileAtomic(to, bytes);
    written++;
  }

  let removed = 0;
  if (existsSync(destDir)) {
    for (const rel of listOriginFiles(destDir)) {
      if (shipped.has(rel)) continue;
      const path = join(destDir, ...rel.split("/"));
      // A runtime fork keeps its origin — see the note above.
      if (existsSync(`${path.slice(0, -ORIGIN_SUFFIX.length)}.jsonc`)) continue;
      unlinkSync(path);
      removed++;
    }
    removeEmptyDirsUnder(destDir);
  }

  return { written, removed };
}
