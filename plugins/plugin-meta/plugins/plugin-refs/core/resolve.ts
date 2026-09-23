import { posix } from "node:path";
import { asFsPath } from "@plugins/framework/plugins/plugin-id/core";
import type { DotRef, PathRef, RefRange, RelativeRef } from "./types";

/** The repo directory every plugin lives under. */
export const PLUGINS_DIR = "plugins";

/**
 * Reduce a path under `plugins/` (`primitives/plugins/terminal/web/x.tsx`) to its
 * maximal plugin-dir prefix (`primitives/plugins/terminal`) by walking the
 * alternating `<seg>(/plugins/<seg>)*` grammar the plugin tree assigns — the
 * plugin dir ends at the first non-`plugins` interstitial (a runtime folder).
 */
export function pluginDirPrefix(relUnderPlugins: string): string {
  const segs = relUnderPlugins.split("/");
  let prefix = segs[0] ?? "";
  let i = 1;
  while (segs[i] === "plugins" && segs[i + 1]) {
    prefix += `/plugins/${segs[i + 1]}`;
    i += 2;
  }
  return prefix;
}

const PLUGINS_PATH_RE = /^plugins(?:\/[A-Za-z0-9._-]+)+$/;

/**
 * The part under `plugins/` of a string that is ENTIRELY a `plugins/…` path
 * (optionally ending in a trailing slash and/or a `*` / `**` glob), or null. The
 * whole-literal rule is what keeps a path embedded in a prose sentence out: the
 * locator cannot adjudicate prose.
 */
export function pluginPathFromLiteral(s: string): string | null {
  const cut = s.split("*")[0]!.replace(/\/+$/, "");
  if (!PLUGINS_PATH_RE.test(cut)) return null;
  return cut.slice(`${PLUGINS_DIR}/`.length);
}

/**
 * The plugin directory (`plugins/a/plugins/b`) a repo path sits in, or null for
 * a path outside `plugins/`. Path-grammar only: whether that directory really is
 * a plugin is the plugin tree's answer, not this one's.
 */
export function pluginDirOfPath(repoPath: string): string | null {
  const rel = pluginPathFromLiteral(repoPath);
  return rel == null ? null : `${PLUGINS_DIR}/${pluginDirPrefix(rel)}`;
}

/** The plugin directory (`plugins/a/plugins/b`) a path or dot ref names. */
export function pluginDirOfRef(ref: PathRef | DotRef): string {
  return ref.kind === "path" ? ref.value : `${PLUGINS_DIR}/${asFsPath(ref.id)}`;
}

/** True iff repo path `path` is `dir` itself or inside it. */
export function isWithinDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

const GLOB_CHARS_RE = /[*?{[]/;

/** True when a relative path is a glob (CSS `@source` only). */
export function hasGlob(value: string): boolean {
  return GLOB_CHARS_RE.test(value);
}

export type ResolvedRelativeRef =
  /**
   * `target`: the repo-relative path the ref points at (a glob stays a glob;
   * "" is the repo root). `staticPath`: the part that must exist — `target`
   * itself, or for a glob the directory before its first glob segment.
   */
  | { kind: "inside"; target: string; staticPath: string }
  /** The path climbs out of the repo root. */
  | { kind: "outside"; target: string };

function decodePath(value: string): string {
  // Markdown links percent-encode spaces etc.; a malformed escape is the
  // author's literal text, so it is resolved as written.
  if (!value.includes("%")) return value;
  try {
    return decodeURI(value);
  } catch (err) {
    if (err instanceof URIError) return value;
    throw err;
  }
}

/** Resolve a relative ref against the directory of the file it is written in. */
export function resolveRelativeRef(ref: RelativeRef): ResolvedRelativeRef {
  const joined = posix.normalize(
    posix.join(posix.dirname(ref.file), decodePath(ref.value)),
  );
  const target = joined === "." ? "" : joined.replace(/\/+$/, "");
  if (target === ".." || target.startsWith("../")) {
    return { kind: "outside", target };
  }
  if (!ref.glob) return { kind: "inside", target, staticPath: target };
  const segs = target.split("/");
  const firstGlob = segs.findIndex((s) => hasGlob(s));
  return {
    kind: "inside",
    target,
    staticPath: segs
      .slice(0, firstGlob < 0 ? segs.length : firstGlob)
      .join("/"),
  };
}

/**
 * The relative path to write in `sourceFile` so it points at repo path
 * `targetPath` — the inverse of `resolveRelativeRef`. A path in the same
 * directory is written bare (`x.md`), as authors write it; a directory target
 * with no remaining segments is `.`.
 */
export function relativeLinkFrom(
  sourceFile: string,
  targetPath: string,
): string {
  const rel = posix.relative(posix.dirname(sourceFile), targetPath);
  return rel === "" ? "." : rel;
}

/** 1-based line numbers for offsets of one text, from one newline scan. */
export function lineIndex(text: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * Throws unless `text.slice(range)` is `value` — the invariant every ref
 * carries, asserted where a ref is minted so a scanner offset bug fails loudly
 * instead of handing a rewriter a range that edits the wrong characters.
 */
export function assertRange(
  file: string,
  text: string,
  range: RefRange,
  value: string,
): void {
  const at = text.slice(range.start, range.end);
  if (at !== value) {
    throw new Error(
      `plugin-refs: ${file}@${range.start}: range holds ${JSON.stringify(at)}, expected ${JSON.stringify(value)}`,
    );
  }
}
