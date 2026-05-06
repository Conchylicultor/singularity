import { existsSync } from "fs";
import { join, relative, sep } from "path";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/shared";
import type { ZoneDefinition } from "./types";

const RUNTIMES = new Set(["web", "server", "central", "shared"]);

export interface ResolvedZone {
  /** Zone name without runtime suffix (e.g., "plugin.shell", "core", "server"). */
  zone: string;
  /** Runtime suffix if present (e.g., "web", "server", "shared"), or null for non-runtime zones. */
  runtime: string | null;
}

export interface ZoneMap {
  allZones: Set<string>;
  resolveFile(relFile: string): ResolvedZone | null;
  resolveImport(specifier: string): ResolvedZone | null;
}

interface ZoneEntry {
  name: string;
  match: string;
}

export function buildZoneMap(
  root: string,
  zones: ZoneDefinition[],
  pluginTree: PluginTree | null,
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
        const zoneName = `${z.name}.${node.hierarchyId}`;
        allZones.add(zoneName);
        pluginHierarchyToZone.set(node.hierarchyId, zoneName);
        pluginRelPathToHierarchy.set(node.path, node.hierarchyId);
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
          const hierarchyId = pluginRelPathToHierarchy.get(pluginPath)!;
          const afterPlugin = rest.slice(pluginPath.length + 1);
          const rtSegment = afterPlugin.split("/")[0];
          if (rtSegment && RUNTIMES.has(rtSegment)) {
            return { zone: `${pluginZoneName}.${hierarchyId}`, runtime: rtSegment };
          }
          return { zone: `${pluginZoneName}.${hierarchyId}`, runtime: null };
        }
      }
      return null;
    }

    const sortedEntries = [...entries].sort((a, b) => b.match.length - a.match.length);
    for (const entry of sortedEntries) {
      if (norm.startsWith(entry.match + "/") || norm === entry.match) {
        return { zone: entry.name, runtime: null };
      }
    }

    return null;
  }

  function resolveImport(specifier: string): ResolvedZone | null {
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
      if (remaining.length > 0 && RUNTIMES.has(remaining[0]!)) {
        return { zone: `${pluginZoneName}.${bestHierarchy}`, runtime: remaining[0]! };
      }
      return { zone: `${pluginZoneName}.${bestHierarchy}`, runtime: null };
    }

    if (specifier === "@core" || specifier.startsWith("@core/")) {
      return { zone: "core", runtime: null };
    }

    if (specifier.startsWith("@server/")) {
      return { zone: "server", runtime: null };
    }

    if (specifier.startsWith("@central/")) {
      return { zone: "central", runtime: null };
    }

    return null;
  }

  return { allZones, resolveFile, resolveImport };
}
