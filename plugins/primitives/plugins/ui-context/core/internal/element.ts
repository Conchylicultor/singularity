import type { UiContextMeta } from "./token";
import { parseLineagePath } from "./node";

/**
 * The picked element, described: the `element` field of a `<ui-context>` token
 * (its `<picked-content>` body), structured.
 *
 * The wire spelling — `div[role=tab] — Save`, `input[type=checkbox]` — is written for
 * the agent reading the token: the tag and ARIA role are exactly what it needs
 * to locate the node. A person reading the chip needs the opposite: what the
 * thing IS ("Tab") and what it says ("Save"), never the markup. Both readings
 * come from one structure, so the formatter (the picker) and the parser (the
 * chip) live here, side by side, and cannot drift — same arrangement as
 * `formatLineageNode` / `parseLineageNode`.
 */
export interface ElementDescriptor {
  /** Lower-case tag name. */
  tag: string;
  /** Explicit ARIA `role`, when the element declares one. */
  role?: string;
  /** An `<input>`'s `type`, which decides what the input is. */
  type?: string;
  /** Accessible name / visible text, already trimmed and shortened. */
  name?: string;
}

/** Separates the markup head from the name — written by the formatter, read by
 *  the parser, spelled once. */
const NAME_SEP = " — ";

export function formatElementDescriptor(d: ElementDescriptor): string {
  const head =
    d.tag +
    (d.role ? `[role=${d.role}]` : "") +
    (d.type ? `[type=${d.type}]` : "");
  return d.name ? `${head}${NAME_SEP}${d.name}` : head;
}

const HEAD_RE = /^([a-z][a-z0-9-]*)((?:\[[a-z-]+=[^\]]*\])*)$/;
const ATTR_RE = /\[([a-z-]+)=([^\]]*)\]/g;

/**
 * The inverse of `formatElementDescriptor`. Returns null for an `element` that
 * is not a descriptor at all — a crash token's body is the boundary's own
 * free-text "slot / label", which a caller shows as-is rather than misreading
 * its first word as a tag.
 */
export function parseElementDescriptor(s: string): ElementDescriptor | null {
  const sep = s.indexOf(NAME_SEP);
  const head = sep === -1 ? s : s.slice(0, sep);
  const name = sep === -1 ? "" : s.slice(sep + NAME_SEP.length).trim();
  const m = HEAD_RE.exec(head.trim());
  if (!m) return null;
  const d: ElementDescriptor = { tag: m[1]! };
  for (const [, k, v] of m[2]!.matchAll(ATTR_RE)) {
    if (k === "role") d.role = v;
    else if (k === "type") d.type = v;
  }
  if (name) d.name = name;
  return d;
}

// What a person calls each kind of element. An explicit role wins over the
// tag (a `<div role=tab>` is a tab); a role/tag absent from both maps is
// generic — it says nothing about what the element is — and the label falls
// through to the component / composition that owns it.
const ROLE_NOUN: Record<string, string> = {
  button: "Button",
  link: "Link",
  tab: "Tab",
  tablist: "Tabs",
  tabpanel: "Tab panel",
  menu: "Menu",
  menubar: "Menu bar",
  menuitem: "Menu item",
  menuitemcheckbox: "Menu item",
  menuitemradio: "Menu item",
  checkbox: "Checkbox",
  radio: "Radio button",
  switch: "Switch",
  slider: "Slider",
  textbox: "Text field",
  searchbox: "Search field",
  combobox: "Dropdown",
  listbox: "List",
  option: "Option",
  list: "List",
  listitem: "List item",
  grid: "Grid",
  gridcell: "Cell",
  table: "Table",
  row: "Row",
  cell: "Cell",
  columnheader: "Column header",
  tree: "Tree",
  treeitem: "Tree item",
  dialog: "Dialog",
  alertdialog: "Dialog",
  tooltip: "Tooltip",
  toolbar: "Toolbar",
  heading: "Heading",
  img: "Image",
  progressbar: "Progress bar",
  separator: "Divider",
  navigation: "Navigation",
  status: "Status",
  alert: "Alert",
};

const TAG_NOUN: Record<string, string> = {
  a: "Link",
  button: "Button",
  textarea: "Text field",
  select: "Dropdown",
  option: "Option",
  label: "Label",
  img: "Image",
  svg: "Icon",
  video: "Video",
  audio: "Audio player",
  canvas: "Canvas",
  iframe: "Embedded page",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  h6: "Heading",
  p: "Paragraph",
  ul: "List",
  ol: "List",
  li: "List item",
  table: "Table",
  tr: "Row",
  td: "Cell",
  th: "Column header",
  nav: "Navigation",
  header: "Header",
  footer: "Footer",
  aside: "Sidebar",
  form: "Form",
  dialog: "Dialog",
  code: "Code",
  pre: "Code block",
  hr: "Divider",
  kbd: "Shortcut",
};

const INPUT_TYPE_NOUN: Record<string, string> = {
  checkbox: "Checkbox",
  radio: "Radio button",
  range: "Slider",
  color: "Color picker",
  file: "File picker",
  date: "Date field",
  "datetime-local": "Date field",
  time: "Time field",
  search: "Search field",
  number: "Number field",
  password: "Password field",
  submit: "Button",
  button: "Button",
  reset: "Button",
};

/** What kind of thing the element is, or undefined when its markup says
 *  nothing (a `<div>`, a `<span>`). */
function kindNoun(d: ElementDescriptor): string | undefined {
  if (d.role && ROLE_NOUN[d.role]) return ROLE_NOUN[d.role];
  if (d.tag === "input") return INPUT_TYPE_NOUN[d.type ?? ""] ?? "Text field";
  return TAG_NOUN[d.tag];
}

/** `SpreadWheel` / `spread-wheel` / `deploy_detail` → "Spread wheel". */
function humanize(identifier: string): string {
  const words = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => (/^[A-Z0-9]+$/.test(w) && w.length > 1 ? w : w.toLowerCase()));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The owning component's name, from `owner` = `Name@file:line`. */
function ownerName(owner: string | undefined): string | undefined {
  const name = owner?.split("@")[0]?.trim();
  return name ? humanize(name) : undefined;
}

/** The innermost lineage node, named: a region's own label-free id or a
 *  contribution's author id (the part after `plugin:`), else its plugin's leaf. */
function lineageName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const node = parseLineagePath(path).at(-1);
  if (!node) return undefined;
  const raw =
    node.kind === "region"
      ? node.id
      : (node.contributionId?.split(":").at(-1) ??
        node.pluginId.split(/[./]/).at(-1));
  return raw ? humanize(raw) : undefined;
}

/** How a person reads a captured element: `title` is what to call it (its
 *  name when it has one, else what it is), `kind` what sort of element it is
 *  when the title alone does not say. */
export interface UiContextLabel {
  title: string;
  kind?: string;
}

/**
 * The human label for a captured element — what the chip shows instead of the
 * markup. In order: the element's own name ("Attach UI element", kind
 * "Button"); what its markup says it is ("Button"); the component that owns it
 * ("Spread wheel"); the composition slot or region it sits in ("Element
 * picker"); and only then the generic "Element".
 */
export function uiContextLabel(meta: UiContextMeta): UiContextLabel {
  const d = parseElementDescriptor(meta.element);
  // Not a descriptor (a crash token's free-text body): already prose.
  if (!d) return { title: meta.element };
  const kind = kindNoun(d);
  if (d.name) return { title: d.name, kind: kind ?? "Element" };
  const title =
    kind ?? ownerName(meta.owner) ?? lineageName(meta.path) ?? "Element";
  return { title };
}
