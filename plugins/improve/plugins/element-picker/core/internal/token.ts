export interface UiContextMeta {
  url: string;
  pluginId?: string;
  slotId?: string;
  paneId?: string;
  // Composition lineage outer→inner, e.g. "tasks/task-header@TaskDetail.Section >
  // improve/element-picker@ActionBar.Item". Points at the contributing source far
  // more precisely than pluginId alone; omitted when there's only one marker.
  path?: string;
  element: string; // e.g. "button — Improve this app"
  selector?: string; // short CSS path for precision, e.g. "header>div>button"
}

// Attribute values are quote-delimited, so only `"` would break them (a `>`
// inside quotes — e.g. a CSS selector "div>div" — is fine). Collapse whitespace
// so the tag stays single-line for the editor's line-based markdown sync.
const sanitizeAttr = (v: string) =>
  v.replace(/"/g, "'").replace(/\s+/g, " ").trim();

// The body is angle-bracket-delimited and captured as `[^<]*`, so a stray `<`
// would terminate it early; strip it (a `>` is harmless in the body).
const sanitizeBody = (v: string) =>
  v.replace(/</g, "'").replace(/\s+/g, " ").trim();

// Fixed, model-facing preamble carried in the tag body. The tag flows verbatim
// into the agent prompt, so an agent reading it cold needs to know what it is
// and how the user produced it — not just a bag of attributes. Kept in one
// place so serialize/parse never drift; the actual picked-element label follows.
const BODY_PREAMBLE =
  "The user pointed at this element in the live app using the element-picker inspector; it is the UI element their request refers to. Picked element: ";

// Structured machine coordinates live in attributes; the human/model-readable
// explanation + element label live in the body — the standard XML split, which
// reads far more naturally to a model than cramming prose into an attribute.
export function serializeUiContext(m: UiContextMeta): string {
  const attr = (k: string, v?: string) => (v ? ` ${k}="${sanitizeAttr(v)}"` : "");
  const open =
    `<ui-context url="${sanitizeAttr(m.url)}"` +
    `${attr("plugin", m.pluginId)}${attr("slot", m.slotId)}` +
    `${attr("pane", m.paneId)}${attr("path", m.path)}${attr("selector", m.selector)}>`;
  return `${open}${BODY_PREAMBLE}${sanitizeBody(m.element)}</ui-context>`;
}

// Match the paired tag. Attribute values are quoted so they may safely contain
// `>` (e.g. a CSS-path selector "div>div>div"); the body is angle-bracket-free
// (sanitized at serialize time) so `[^<]*` captures it unambiguously up to the
// closing tag. Stays single-line so it survives the editor's line-based scan.
export const UI_CONTEXT_RE =
  /<ui-context(?:\s+[\w-]+="[^"]*")*\s*>([^<]*)<\/ui-context>/g;

export function parseUiContext(match: RegExpExecArray): UiContextMeta | null {
  const tag = match[0];
  const body = (match[1] ?? "").trim();
  const get = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(tag)?.[1];
  const url = get("url");
  const element = body.startsWith(BODY_PREAMBLE)
    ? body.slice(BODY_PREAMBLE.length).trim()
    : body;
  if (!url || !element) return null;
  return {
    url,
    element,
    pluginId: get("plugin"),
    slotId: get("slot"),
    paneId: get("pane"),
    path: get("path"),
    selector: get("selector"),
  };
}
