export interface UiContextMeta {
  url: string;
  pluginId?: string;
  slotId?: string;
  // Author-supplied contribution id, keyed for cross-plugin uniqueness as
  // `pluginId:id` (e.g. "improve/element-picker:element-picker").
  contributionId?: string;
  paneId?: string;
  // Composition lineage outer→inner, e.g. "tasks/task-header@TaskDetail.Section >
  // improve/element-picker@ActionBar.Item". Points at the contributing source far
  // more precisely than pluginId alone; omitted when there's only one marker.
  path?: string;
  element: string; // e.g. "button — Improve this app"
  selector?: string; // short CSS path for precision, e.g. "header>div>button"
  // Repo-relative source `file:line` of the picked element, stamped by the
  // source-location build transform (present only when that transform is active).
  source?: string;
  // The nearest *semantic* component that owns the picked element, as
  // `Name@file:line` (e.g. "LaunchControl@plugins/.../launch-control.tsx:197").
  // Stamped by injecting `data-ui-owner` on component callsites, which rides the
  // composed primitive's `{...props}` spread onto the host element — so it names
  // the composing component (which authors no host element of its own) rather
  // than the leaf primitive `source` points at. Complements `source`; omitted
  // when the picked element doesn't flow through a prop-forwarding primitive.
  owner?: string;
}

// One machine-coordinate field of the ui-context tag. THE single source of truth
// for the attribute set: serialize writes these, parse reads these, and the chip
// popover displays these — each by iterating this list. Adding a field here makes
// it flow to the wire, the parser, and the UI by construction, so the three can
// never drift out of sync (the bug where the popover silently dropped
// contribution/source/owner). `element` is intentionally absent — it is the
// <picked-content> body, not an attribute, and is handled on its own.
export interface UiContextField {
  /** Property on UiContextMeta this field reads/writes. */
  key: Exclude<keyof UiContextMeta, "element">;
  /** Attribute name in the serialized `<ui-context …>` tag. */
  attr: string;
  /** Human-readable label shown in the chip popover. */
  label: string;
  /** Always emitted (never omitted-when-empty). Only `url` is required. */
  required?: boolean;
}

// Preserves the literal `key` of each field (so the exhaustiveness check below
// can see exactly which keys are registered) while typing the rest as a full
// UiContextField — so `.required` is always present, not narrowed away.
const field = <K extends UiContextField["key"]>(
  key: K,
  attr: string,
  label: string,
  required = false,
): UiContextField & { key: K } => ({ key, attr, label, required });

// Ordered once; this order is the serialized attribute order AND the popover row
// order. `url` leads (matching the historical wire format), the rest follow
// outer→inner / coarse→fine.
export const UI_CONTEXT_FIELDS = [
  field("url", "url", "URL", true),
  field("pluginId", "plugin", "Plugin"),
  field("slotId", "slot", "Slot"),
  field("contributionId", "contribution", "Contribution"),
  field("paneId", "pane", "Pane"),
  field("path", "path", "Path"),
  field("selector", "selector", "Selector"),
  field("source", "source", "Source"),
  field("owner", "owner", "Owner"),
];

// Compile-time exhaustiveness: every attribute key of UiContextMeta MUST appear
// in UI_CONTEXT_FIELDS. Add a field to the interface without registering it and
// this line fails to type-check, naming the missing key — so a new field cannot
// be serialized/parsed/displayed inconsistently, it simply won't compile.
type RegisteredKey = (typeof UI_CONTEXT_FIELDS)[number]["key"];
type UnregisteredKey = Exclude<Exclude<keyof UiContextMeta, "element">, RegisteredKey>;
const _allFieldsRegistered: UnregisteredKey extends never ? true : UnregisteredKey =
  true;
void _allFieldsRegistered;

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
  const attrs = UI_CONTEXT_FIELDS.map((f) => {
    const v = m[f.key] ?? "";
    return f.required || v ? ` ${f.attr}="${sanitizeAttr(v)}"` : "";
  }).join("");
  return `<ui-context${attrs}><hint>${HINT}</hint><picked-content>${sanitizeBody(m.element)}</picked-content></ui-context>`;
}

// Match the paired tag. Attribute values are quoted so they may safely contain
// `>` (e.g. a CSS-path selector "div>div>div"); the body now nests <hint> and
// <picked-content> tags, so it's matched non-greedily up to the closing tag.
// Those nested tags are the only `<` the body holds — the picked label is
// `<`-sanitized at serialize time. Stays single-line so it survives the
// editor's line-based scan.
export const UI_CONTEXT_RE =
  /<ui-context(?:\s+[\w-]+="[^"]*")*\s*>[\s\S]*?<\/ui-context>/g;

// Accepts the raw matched `<ui-context …>` substring (e.g. an active-data inline
// contribution's `content`, or a `UI_CONTEXT_RE` match's [0]).
export function parseUiContext(tag: string): UiContextMeta | null {
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
  const meta: UiContextMeta = { url, element };
  for (const f of UI_CONTEXT_FIELDS) {
    if (f.key === "url") continue; // captured above and validated non-empty
    const v = get(f.attr);
    if (v !== undefined) meta[f.key] = v;
  }
  return meta;
}
