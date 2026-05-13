// Curated alias keys that don't match their mdName directly.
// e.g. "robot" was stored in DB but the react-icons export is MdPrecisionManufacturing.
const CURATED_ALIASES: Record<string, string> = {
  robot: "MdPrecisionManufacturing", bug: "MdBugReport", database: "MdStorage",
  server: "MdDns", data: "MdDataObject", brain: "MdPsychology",
  sparkle: "MdAutoAwesome", fire: "MdLocalFireDepartment", trending: "MdTrendingUp",
  music: "MdMusicNote", video: "MdVideocam", emoji: "MdEmojiObjects",
  doc: "MdDescription", grid: "MdGridView", table: "MdTableChart",
  calendar: "MdCalendarToday", clock: "MdAccessTime", account: "MdManageAccounts",
  globe: "MdLanguage", play: "MdPlayArrow", chart: "MdBarChart",
  pie: "MdPieChart", currency: "MdAttachMoney",
};

function mdNameToReactKey(mdName: string): string {
  return "Md" + mdName.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
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

let _mdModule: Record<string, unknown> | null = null;

export async function resolveIconSvgNodesJson(iconKey: string): Promise<string | null> {
  if (!_mdModule) {
    _mdModule = (await import("react-icons/md")) as Record<string, unknown>;
  }

  const reactKey = CURATED_ALIASES[iconKey] ?? mdNameToReactKey(iconKey);
  const Icon = _mdModule[reactKey] as ((props: Record<string, never>) => { props: { children: unknown } }) | undefined;
  if (!Icon) return null;

  const el = Icon({});
  const nodes = extractChildren(el.props.children);
  if (nodes.length === 0) return null;
  return JSON.stringify(nodes);
}
