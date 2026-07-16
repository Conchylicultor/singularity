// SvgNode — the storage format for icon SVG data. Matches the react-icons
// internal child-tree shape: { tag, attr, child[] }. Stored as JSON text in DB
// columns so consumers render raw <svg> without importing any icon module.
// Pure type with no runtime deps — safe to import from web, server, and
// cross-plugin.

export interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
}

export { svgNodesToString } from "./internal/svg-nodes-to-string";

// The full generated icon map. Re-exported from the barrel (not deep-imported)
// so the web picker's lazy `import("../../core")` stays a barrel edge: in
// artifact mode every own-core import is rewritten to the external
// `@plugins/<path>/core` specifier, and only barrel exports resolve there.
// Consumers load it lazily — the map is ~2 MB of generated data.
export { ICON_SVG_MAP } from "./internal/icon-svg-map.generated";
