/**
 * Where a source file and an import specifier sit inside a plugin's own tree —
 * the one reading of the plugin-dir grammar both runtime-isolation rules share.
 *
 * Pure segment arithmetic (no node:path, no filesystem) so the rules stay
 * dependency-free: they dual-load under jiti and Bun, and folder names are all
 * they need.
 */

/** Normalize a path to `/` separators (the rules reason in posix segments). */
export function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/**
 * Walk the alternating `<name>(/plugins/<name>)*` grammar a plugin dir follows,
 * from `segs[start]`, and return the index of the plugin dir's LAST segment.
 * The plugin dir ends at the first non-`plugins` interstitial — a runtime folder.
 */
function pluginDirEnd(segs: string[], start: number): number {
  let i = start;
  while (segs[i + 1] === "plugins" && segs[i + 2] !== undefined) i += 2;
  return i;
}

/** A source file's plugin dir and the top-level folder it sits in. */
export interface OwnLocation {
  pluginDir: string;
  folder: string;
}

/** The plugin dir and the runtime folder of an absolute source file, if any. */
export function locate(absPath: string): OwnLocation | null {
  const segs = toPosix(absPath).split("/");
  const pluginsRoot = segs.indexOf("plugins");
  if (pluginsRoot === -1 || segs[pluginsRoot + 1] === undefined) return null;
  const end = pluginDirEnd(segs, pluginsRoot + 1);
  const folder = segs[end + 1];
  if (folder === undefined) return null;
  return { pluginDir: segs.slice(0, end + 1).join("/"), folder };
}

/** Resolve a relative specifier against the importing file. */
function resolveRelative(fromFile: string, specifier: string): string {
  const out = toPosix(fromFile).split("/").slice(0, -1);
  for (const seg of specifier.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/**
 * Where a specifier lands WITHIN the importing file's own plugin: the top-level
 * folder, and the path segments below it (`[]` for the folder itself). Null
 * when the specifier leaves the plugin, or is a bare npm package.
 *
 * Covers both spellings of an own-tree edge: a relative path, and the plugin's
 * own absolute self-specifier `@plugins/<own path>/<folder>/…`.
 */
export function ownTargetOf(
  specifier: string,
  file: string,
  source: OwnLocation,
): { folder: string; rest: string[] } | null {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = resolveRelative(file, specifier);
    const located = locate(target);
    if (located === null || located.pluginDir !== source.pluginDir) return null;
    const below = target.slice(located.pluginDir.length + 1).split("/");
    return { folder: located.folder, rest: below.slice(1) };
  }
  if (!specifier.startsWith("@plugins/")) return null;
  const segs = specifier.slice("@plugins/".length).split("/");
  const end = pluginDirEnd(segs, 0);
  const folder = segs[end + 1];
  if (folder === undefined) return null;
  const pluginPath = segs.slice(0, end + 1).join("/");
  return source.pluginDir.endsWith(`/plugins/${pluginPath}`)
    ? { folder, rest: segs.slice(end + 2) }
    : null;
}
