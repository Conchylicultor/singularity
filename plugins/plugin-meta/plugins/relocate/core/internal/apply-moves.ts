// Replays the plugin-move ledger onto one namespace's USER-layer config dir
// (`~/.singularity/state/config/<namespace>/`). Run by `./singularity build`
// right before it propagates the git config into that dir, so the dir is
// already shaped like the code being deployed when propagation reads it.
//
// A plugin's config lives under its id's slash path, and saved reorder layouts
// name contributions `"<pluginId>:<id>"` in ANY slot's file. A move changes
// both. For each entry this namespace has not applied yet:
//
//   1. every file under `<from path>/` moves to the same spot under `<to path>/`
//      — a file already at the destination wins and the source stays put (the
//      orphan audit then flags it). Nothing is overwritten or deleted.
//   2. every reorder key naming the moved plugin (or a descendant) is rewritten,
//      in every `.jsonc` of the namespace — found by the same locator the mover
//      uses on the git layer (`scanReorderItemRefs`).
//   3. hash headers are kept consistent. An override records the hash of the
//      default it was written against; rewriting that default's keys changes
//      its hash, which would mark the override stale and let the default win —
//      the very loss this prevents. So every rewritten origin/ancestor yields an
//      old → new hash pair, and each override's header is re-stamped through it.
//
// Each applied entry is recorded in the namespace's marker file, so an entry is
// replayed once — even if a later plugin reuses the old id. A namespace whose
// dir does not exist yet records every entry as applied: it has nothing to move.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { z } from "zod";
import { computeHash, type JsonValue } from "@plugins/config_v2/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { scanReorderItemRefs } from "@plugins/plugin-meta/plugins/plugin-refs/core";
import {
  movedPluginId,
  pluginMoveKey,
  readPluginMoves,
  type PluginMove,
} from "./ledger";

/** Per-namespace record of the ledger entries already applied. Not `.jsonc`,
 *  so neither the config registry nor the orphan audit ever reads it. */
export const APPLIED_MOVES_FILE = ".plugin-moves-applied.json";

const appliedSchema = z.object({ applied: z.array(z.string()) });

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

export interface AppliedMove {
  move: PluginMove;
  /** Files moved from the old slash path to the new one (dir-relative). */
  moved: string[];
  /** Files left at the old path because the destination already had one. */
  kept: string[];
  /** Files whose reorder keys or hash header were rewritten. */
  rewritten: string[];
}

function readApplied(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(
    appliedSchema.parse(JSON.parse(readFileSync(file, "utf8"))).applied,
  );
}

function writeApplied(file: string, applied: Set<string>): void {
  writeFileSync(
    file,
    `${JSON.stringify({ applied: [...applied] }, null, 2)}\n`,
  );
}

/** Every file under `dir`, relative to it, forward-slash separated. */
function walkFiles(dir: string, rel = "", out: string[] = []): string[] {
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) walkFiles(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/** Remove every empty dir under (and including) `dir`, deepest first. */
function pruneEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmptyDirs(join(dir, e.name));
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

function moveTree(
  src: string,
  dst: string,
): { moved: string[]; kept: string[] } {
  const moved: string[] = [];
  const kept: string[] = [];
  if (!existsSync(src)) return { moved, kept };
  for (const rel of walkFiles(src)) {
    const to = join(dst, rel);
    if (existsSync(to)) {
      kept.push(rel);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    renameSync(join(src, rel), to);
    moved.push(rel);
  }
  pruneEmptyDirs(src);
  return { moved, kept };
}

function parseContent(file: string, text: string): JsonValue {
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true }) as
    JsonValue | undefined;
  if (errors.length > 0 || value === undefined) {
    throw new Error(`plugin moves: ${file} is not valid JSONC`);
  }
  return value;
}

const isSnapshot = (f: string) =>
  f.endsWith(".origin.jsonc") || f.endsWith(".ancestor.jsonc");

/** `text` with every reorder key naming the moved subtree re-rooted. */
function rewriteKeys(file: string, text: string, move: PluginMove): string {
  const edits = scanReorderItemRefs(file, text)
    .map((ref) => ({ ref, to: movedPluginId(ref.id, move.from, move.to) }))
    .filter((e) => e.to !== null)
    .sort((a, b) => b.ref.range.start - a.ref.range.start);
  let out = text;
  for (const { ref, to } of edits) {
    out = out.slice(0, ref.range.start) + to + out.slice(ref.range.end);
  }
  return out;
}

function setHash(text: string, hash: string): string {
  return text.replace(HASH_RE, `// @hash ${hash}\n`);
}

/** Steps 2 and 3 over every `.jsonc` in the namespace dir. */
function rewriteNamespace(dir: string, move: PluginMove): string[] {
  const files = walkFiles(dir).filter((f) => f.endsWith(".jsonc"));
  const texts = new Map<string, string>();
  for (const f of files) texts.set(f, readFileSync(join(dir, f), "utf8"));

  const next = new Map<string, string>();
  const rehash = new Map<string, string>();
  // Snapshots first: they produce the old → new hash pairs overrides follow.
  for (const f of [...files].sort(
    (a, b) => Number(isSnapshot(b)) - Number(isSnapshot(a)),
  )) {
    const text = texts.get(f)!;
    let out = rewriteKeys(f, text, move);
    const header = HASH_RE.exec(out)?.[1];
    if (isSnapshot(f)) {
      if (out !== text && header !== undefined) {
        const hash = computeHash(parseContent(f, out));
        rehash.set(header, hash);
        out = setHash(out, hash);
      }
    } else if (header !== undefined && rehash.has(header)) {
      out = setHash(out, rehash.get(header)!);
    }
    if (out !== text) next.set(f, out);
  }
  for (const [f, text] of next) writeFileSync(join(dir, f), text);
  return [...next.keys()].sort();
}

/**
 * Apply every ledger entry of the checkout at `root` that the namespace config
 * dir `userConfigDir` has not applied yet, in ledger order. Throws (failing the
 * build) on anything unreadable; the marker is written after each entry, so a
 * rerun resumes where it stopped.
 */
export function applyPluginMoves(opts: {
  root: string;
  userConfigDir: string;
}): AppliedMove[] {
  const { root, userConfigDir } = opts;
  const moves = readPluginMoves(root);
  const markerFile = join(userConfigDir, APPLIED_MOVES_FILE);
  const fresh = !existsSync(userConfigDir);
  mkdirSync(userConfigDir, { recursive: true });
  const applied = readApplied(markerFile);
  const out: AppliedMove[] = [];

  for (const move of moves) {
    const key = pluginMoveKey(move);
    if (applied.has(key)) continue;
    if (!fresh) {
      const { moved, kept } = moveTree(
        join(userConfigDir, asPath(move.from)),
        join(userConfigDir, asPath(move.to)),
      );
      const rewritten = rewriteNamespace(userConfigDir, move);
      out.push({ move, moved, kept, rewritten });
    }
    applied.add(key);
    writeApplied(markerFile, applied);
  }
  return out;
}

/** Namespaces under `configRoot` with user config still at `from`'s slash path. */
export function namespacesHolding(
  configRoot: string,
  from: PluginMove["from"],
): string[] {
  if (!existsSync(configRoot)) return [];
  return readdirSync(configRoot)
    .filter((ns) => existsSync(join(configRoot, ns, asPath(from))))
    .sort();
}
