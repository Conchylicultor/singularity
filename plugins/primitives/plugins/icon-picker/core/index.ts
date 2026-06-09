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
