import type { IconType } from "react-icons";

// ---------------------------------------------------------------------------
// SvgNode — the storage format for icon SVG data. Matches the react-icons
// internal child-tree shape: { tag, attr, child[] }. Stored as JSON text in
// DB columns so Avatar can render raw <svg> without any icon module import.
// ---------------------------------------------------------------------------

export interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
}

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
// Default agent avatar — inlined SVG for MdPrecisionManufacturing so we
// never need an icon module import for the most common avatar.
// ---------------------------------------------------------------------------

export const DEFAULT_AGENT_AVATAR: { icon: string; color: string; svgNodes: SvgNode[] } = {
  icon: "precision_manufacturing",
  color: "violet",
  svgNodes: [{
    tag: "path",
    attr: { d: "m19.93 8.21-3.6 1.68L14 7.7V6.3l2.33-2.19 3.6 1.68c.38.18.82.01 1-.36.18-.38.01-.82-.36-1L16.65 2.6a.993.993 0 0 0-1.13.2l-1.74 1.6A.975.975 0 0 0 13 4c-.55 0-1 .45-1 1v1H8.82C8.34 4.65 6.98 3.73 5.4 4.07c-1.16.25-2.15 1.25-2.36 2.43-.22 1.32.46 2.47 1.48 3.08L7.08 18H4v3h13v-3h-3.62L8.41 8.77c.17-.24.31-.49.41-.77H12v1c0 .55.45 1 1 1 .32 0 .6-.16.78-.4l1.74 1.6c.3.3.75.38 1.13.2l3.92-1.83c.38-.18.54-.62.36-1a.753.753 0 0 0-1-.36zM6 8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" },
    child: [],
  }],
};

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
// Full icon set — dynamically loaded on demand (react-icons/md + metadata JSON).
// Only used by the AvatarPicker for browsing/searching, never for rendering.
// ---------------------------------------------------------------------------

export interface FullIconEntry { key: string; Icon: IconType; label: string }
export interface FullIconCategory { label: string; entries: FullIconEntry[] }
export interface FullIconSet {
  categories: FullIconCategory[];
  search: (query: string) => FullIconEntry[];
}

let _fullSetCache: FullIconSet | null = null;

function mdNameToReactKey(mdName: string): string {
  return "Md" + mdName.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

export async function loadFullIconSet(): Promise<FullIconSet> {
  if (_fullSetCache) return _fullSetCache;

  const [mdModule, { default: meta }] = await Promise.all([
    import("react-icons/md"),
    import("./icon-metadata.json"),
  ]);

  const mdCache = mdModule as Record<string, unknown>;
  const metaTyped = meta as Record<string, { category: string; tags: string[] }>;

  type RichEntry = FullIconEntry & { category: string; tags: string[] };
  const entries: RichEntry[] = [];

  for (const [mdName, { category, tags }] of Object.entries(metaTyped)) {
    const Icon = mdCache[mdNameToReactKey(mdName)] as IconType | undefined;
    if (!Icon) continue;
    entries.push({ key: mdName, Icon, label: mdName.replace(/_/g, " "), category, tags });
  }

  const catMap = new Map<string, FullIconEntry[]>();
  for (const { key, Icon, label, category } of entries) {
    const catLabel = CATEGORY_LABELS[category] ?? category;
    if (!catMap.has(catLabel)) catMap.set(catLabel, []);
    catMap.get(catLabel)!.push({ key, Icon, label });
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
      .map(({ key, Icon, label }) => ({ key, Icon, label }));
  };

  _fullSetCache = { categories, search };
  return _fullSetCache;
}
