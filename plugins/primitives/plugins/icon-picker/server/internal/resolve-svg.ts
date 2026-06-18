import type { SvgNode } from "../../core";
import type { ICON_SVG_MAP as IconSvgMap } from "./icon-svg-map.generated";

type IconSvgMapModule = { ICON_SVG_MAP: typeof IconSvgMap };

// The generated map is ~636 KB. Importing it at module scope parses and holds it
// resident in RSS on EVERY backend boot, even though most worktrees never resolve
// an icon SVG. Load it lazily on first resolution and memoize it instead.
//
// `resolveIconSvgNodes` is a synchronous field-value resolver (registered via
// `registerFieldResolver("avatar", ...)` and invoked inside a synchronous zod
// `.transform()`), so this loader must stay synchronous — `await import(...)`
// would force the entire resolver chain to become async. Bun resolves `require`
// of a TS module synchronously, so a memoized `require` gives us lazy loading
// without changing the call signature.
let cachedMap: typeof IconSvgMap | undefined;

function getIconSvgMap(): typeof IconSvgMap {
  if (cachedMap === undefined) {
    const mod = require("./icon-svg-map.generated") as IconSvgMapModule;
    cachedMap = mod.ICON_SVG_MAP;
  }
  return cachedMap;
}

export function resolveIconSvgNodes(iconKey: string): SvgNode[] | null {
  return (getIconSvgMap()[iconKey] as SvgNode[] | undefined) ?? null;
}

export async function resolveIconSvgNodesJson(iconKey: string): Promise<string | null> {
  const nodes = resolveIconSvgNodes(iconKey);
  return nodes ? JSON.stringify(nodes) : null;
}
