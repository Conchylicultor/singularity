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

// Fixed, model-facing hint carried in its own body tag. The tag flows verbatim
// into the agent prompt, so an agent reading it cold needs to know what it is
// and how the user produced it. It's framing — *not* picked data — so it lives
// in a distinct <hint> tag, kept apart from the <picked-content> label rather
// than concatenated into one flat run the model has to disentangle.
const HINT =
  "The user pointed at this element in the live app using the element-picker inspector; it is the UI element their request refers to.";

// Legacy flat-body preamble (hint + label concatenated). Retained only so the
// parser still reads tags serialized before the <hint>/<picked-content> split.
const LEGACY_BODY_PREAMBLE = `${HINT} Picked element: `;

// Structured machine coordinates live in attributes; the constant hint and the
// per-pick label live in the body as two sibling tags — the standard XML split,
// which reads far more naturally to a model than cramming prose into an
// attribute, and keeps the fixed framing cleanly separated from the content.
export function serializeUiContext(m: UiContextMeta): string {
  const attr = (k: string, v?: string) => (v ? ` ${k}="${sanitizeAttr(v)}"` : "");
  const open =
    `<ui-context url="${sanitizeAttr(m.url)}"` +
    `${attr("plugin", m.pluginId)}${attr("slot", m.slotId)}` +
    `${attr("pane", m.paneId)}${attr("path", m.path)}${attr("selector", m.selector)}>`;
  return `${open}<hint>${HINT}</hint><picked-content>${sanitizeBody(m.element)}</picked-content></ui-context>`;
}

// Match the paired tag. Attribute values are quoted so they may safely contain
// `>` (e.g. a CSS-path selector "div>div>div"); the body now nests <hint> and
// <picked-content> tags, so it's matched non-greedily up to the closing tag.
// Those nested tags are the only `<` the body holds — the picked label is
// `<`-sanitized at serialize time. Stays single-line so it survives the
// editor's line-based scan.
export const UI_CONTEXT_RE =
  /<ui-context(?:\s+[\w-]+="[^"]*")*\s*>[\s\S]*?<\/ui-context>/g;

export function parseUiContext(match: RegExpExecArray): UiContextMeta | null {
  const tag = match[0];
  const get = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(tag)?.[1];
  const url = get("url");
  // New tags carry the label in <picked-content>; fall back to the legacy flat
  // body (hint + label concatenated) so tags from before the split still parse.
  let element = /<picked-content>([\s\S]*?)<\/picked-content>/.exec(tag)?.[1]?.trim();
  if (element === undefined) {
    const body = tag
      .replace(/^<ui-context[^>]*>/, "")
      .replace(/<\/ui-context>$/, "")
      .trim();
    element = body.startsWith(LEGACY_BODY_PREAMBLE)
      ? body.slice(LEGACY_BODY_PREAMBLE.length).trim()
      : body;
  }
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
