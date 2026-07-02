import type { IconType } from "react-icons";
import type { SvgNode } from "../../core";

export type { SvgNode };

export function extractSvgNodes(Icon: IconType): SvgNode[] {
  const el = (Icon as (props: Record<string, never>) => { props: { children: unknown } })({});
  return extractChildren(el.props.children);
}

function extractChildren(children: unknown): SvgNode[] {
  if (!children) return [];
  const arr = Array.isArray(children) ? children : [children];
  return arr
    .filter((c: unknown): c is { type: string; props: Record<string, unknown> } =>
      typeof c === "object" && c !== null && "props" in c,
    )
    .filter((c) => !(c.props.fill === "none" && typeof c.props.d === "string" && c.props.d.startsWith("M0 0")))
    .map((c) => ({
      tag: c.type,
      attr: Object.fromEntries(
        Object.entries(c.props).filter(([k]) => k !== "children"),
      ) as Record<string, string>,
      child: extractChildren(c.props.children),
    }));
}

// ---------------------------------------------------------------------------
// Official MD category display labels.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
  action: "Action", alert: "Alerts", av: "Media", communication: "Communication",
  content: "Content", device: "Device", editor: "Editor", file: "Files",
  hardware: "Hardware", image: "Images", maps: "Maps", navigation: "Navigation",
  notification: "Notifications", social: "Social", toggle: "Toggle",
};

// ---------------------------------------------------------------------------
// Full icon set — dynamically loaded on demand (generated SvgNode map + metadata
// JSON). Only used by the IconPicker for browsing/searching. Rendered from the
// stored SvgNode data (via <SvgIcon/>), so the ~2 000-icon react-icons/md bundle
// is never pulled into the picker chunk.
// ---------------------------------------------------------------------------

export interface FullIconEntry { key: string; svgNodes: SvgNode[]; label: string }
export interface FullIconCategory { label: string; entries: FullIconEntry[] }
export interface FullIconSet {
  categories: FullIconCategory[];
  search: (query: string) => FullIconEntry[];
}

let _fullSetCache: FullIconSet | null = null;

export async function loadFullIconSet(): Promise<FullIconSet> {
  if (_fullSetCache) return _fullSetCache;

  const [{ ICON_SVG_MAP }, { default: meta }] = await Promise.all([
    import("../../core/internal/icon-svg-map.generated"),
    import("./icon-metadata.json"),
  ]);

  const svgMap = ICON_SVG_MAP as Record<string, SvgNode[]>;
  const metaTyped = meta as Record<string, { category: string; tags: string[] }>;

  type RichEntry = FullIconEntry & { category: string; tags: string[] };
  const entries: RichEntry[] = [];

  for (const [mdName, { category, tags }] of Object.entries(metaTyped)) {
    const svgNodes = svgMap[mdName];
    if (!svgNodes) continue;
    entries.push({ key: mdName, svgNodes, label: mdName.replace(/_/g, " "), category, tags });
  }

  const catMap = new Map<string, FullIconEntry[]>();
  for (const { key, svgNodes, label, category } of entries) {
    const catLabel = CATEGORY_LABELS[category] ?? category;
    if (!catMap.has(catLabel)) catMap.set(catLabel, []);
    catMap.get(catLabel)!.push({ key, svgNodes, label });
  }

  const categories: FullIconCategory[] = Array.from(catMap.entries()).map(([label, es]) => ({ label, entries: es }));

  const search = (query: string): FullIconEntry[] => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter(({ key, label, tags }) => {
        const haystack = [key, label, ...tags].join(" ").toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .map(({ key, svgNodes, label }) => ({ key, svgNodes, label }));
  };

  _fullSetCache = { categories, search };
  return _fullSetCache;
}
