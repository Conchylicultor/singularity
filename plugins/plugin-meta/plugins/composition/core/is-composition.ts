import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";

/**
 * Structural type-guard for a discovered composition manifest. Used by
 * `loadCollectedDir` to validate every `composition/index.ts` default export
 * (and every item of an array export). `PluginId` is a branded string, so the
 * id arrays are checked as `string[]`; that the ids actually *resolve* to real
 * plugins is the `composition-closure` check's job (it needs the plugin tree).
 */
export function isCompositionManifest(value: unknown): value is CompositionManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Partial<CompositionManifest>;
  return (
    typeof m.name === "string" &&
    m.name.length > 0 &&
    Array.isArray(m.entryPoints) &&
    m.entryPoints.every((id) => typeof id === "string") &&
    Array.isArray(m.selectedContributors) &&
    m.selectedContributors.every((id) => typeof id === "string")
  );
}
