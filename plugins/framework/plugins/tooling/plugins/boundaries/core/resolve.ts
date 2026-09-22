import { sep } from "path";
import type { ZoneDefinition } from "./types";

export interface ResolvedZone {
  zone: string;
  runtime: string | null;
}

export interface ZoneMap {
  allZones: Set<string>;
  resolveFile(relFile: string): ResolvedZone | null;
  /**
   * The zone and runtime folder an import lands in, from the importing file
   * (repo-relative) and its specifier. Relative and `@plugins/…` specifiers
   * resolve; anything else (npm packages, a path leaving `plugins/`) is null.
   */
  resolveImport(fromRelFile: string, specifier: string): ResolvedZone | null;
}

/**
 * The part of the plugin tree the zone map reads: each plugin's id and its
 * path under `plugins/`. A full `PluginTree` satisfies it.
 */
export interface PluginDirs {
  byDir: ReadonlyMap<string, { id: string; path: string }>;
}

interface ZoneEntry {
  name: string;
  match: string;
}

export function buildZoneMap(
  _root: string,
  zones: ZoneDefinition[],
  pluginTree: PluginDirs | null,
  runtimes: ReadonlySet<string>,
): ZoneMap {
  const allZones = new Set<string>();
  const entries: ZoneEntry[] = [];

  const pluginHierarchyToZone = new Map<string, string>();
  const pluginRelPathToHierarchy = new Map<string, string>();

  for (const z of zones) {
    allZones.add(z.name);
    entries.push({ name: z.name, match: z.match });

    if (z.discover === "plugin-tree" && pluginTree) {
      for (const node of pluginTree.byDir.values()) {
        const zoneName = `${z.name}.${node.id}`;
        allZones.add(zoneName);
        pluginHierarchyToZone.set(node.id, zoneName);
        pluginRelPathToHierarchy.set(node.path, node.id);
      }
    }
  }

  const pluginZoneDef = zones.find((z) => z.discover === "plugin-tree");
  const pluginDirPrefix = pluginZoneDef ? pluginZoneDef.match + "/" : null;
  const pluginZoneName = pluginZoneDef?.name ?? "plugin";

  const sortedPluginPaths = Array.from(pluginRelPathToHierarchy.keys()).sort(
    (a, b) => b.length - a.length,
  );

  function resolveFile(relFile: string): ResolvedZone | null {
    const norm = relFile.split(sep).join("/");

    if (pluginDirPrefix && norm.startsWith(pluginDirPrefix)) {
      const rest = norm.slice(pluginDirPrefix.length);
      for (const pluginPath of sortedPluginPaths) {
        if (rest.startsWith(pluginPath + "/") || rest === pluginPath) {
          const id = pluginRelPathToHierarchy.get(pluginPath)!;
          const afterPlugin = rest.slice(pluginPath.length + 1);
          const rtSegment = afterPlugin.split("/")[0];
          if (rtSegment && runtimes.has(rtSegment)) {
            return { zone: `${pluginZoneName}.${id}`, runtime: rtSegment };
          }
          return { zone: `${pluginZoneName}.${id}`, runtime: null };
        }
      }
      return null;
    }

    const sortedEntries = [...entries].sort(
      (a, b) => b.match.length - a.match.length,
    );
    for (const entry of sortedEntries) {
      if (norm.startsWith(entry.match + "/") || norm === entry.match) {
        return { zone: entry.name, runtime: null };
      }
    }

    return null;
  }

  function resolveImport(
    fromRelFile: string,
    specifier: string,
  ): ResolvedZone | null {
    // A relative specifier is read the same way as the file it points at:
    // resolve it against the importing file's directory, then classify that
    // path. So `../server/x` from `core/` lands in the plugin's own `server`
    // runtime, and `../../..` out of a child plugin lands in its parent.
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const target = joinRelative(fromRelFile, specifier);
      return target === null ? null : resolveFile(target);
    }

    if (specifier.startsWith("@plugins/")) {
      const rest = specifier.slice("@plugins/".length);
      const parts = rest.split("/");

      let bestHierarchy: string | null = null;
      let bestLen = 0;
      for (let i = 1; i <= parts.length; i++) {
        const candidate = parts.slice(0, i).join("/");
        if (pluginRelPathToHierarchy.has(candidate) && i > bestLen) {
          bestHierarchy = pluginRelPathToHierarchy.get(candidate)!;
          bestLen = i;
        }
      }

      if (!bestHierarchy) return null;

      const remaining = parts.slice(bestLen);
      if (remaining.length > 0 && runtimes.has(remaining[0]!)) {
        return {
          zone: `${pluginZoneName}.${bestHierarchy}`,
          runtime: remaining[0]!,
        };
      }
      return { zone: `${pluginZoneName}.${bestHierarchy}`, runtime: null };
    }

    return null;
  }

  return { allZones, resolveFile, resolveImport };
}

/**
 * Resolve a relative specifier against a repo-relative file, in posix
 * segments. Null when it climbs above the repo root.
 */
function joinRelative(fromRelFile: string, specifier: string): string | null {
  const out = fromRelFile.split(sep).join("/").split("/").slice(0, -1);
  for (const seg of specifier.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}
