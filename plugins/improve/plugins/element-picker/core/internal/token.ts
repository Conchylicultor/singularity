export interface UiContextMeta {
  url: string;
  pluginId?: string;
  slotId?: string;
  paneId?: string;
  element: string; // e.g. "button — Improve this app"
  selector?: string; // short CSS path for precision, e.g. "header>div>button"
}

const sanitize = (v: string) => v.replace(/"/g, "'").replace(/\s+/g, " ").trim();

export function serializeUiContext(m: UiContextMeta): string {
  const attr = (k: string, v?: string) => (v ? ` ${k}="${sanitize(v)}"` : "");
  return (
    `<ui-context${attr("plugin", m.pluginId)}${attr("slot", m.slotId)}` +
    `${attr("pane", m.paneId)} url="${sanitize(m.url)}" element="${sanitize(m.element)}"` +
    `${attr("selector", m.selector)} />`
  );
}

// Match the self-closing tag by parsing each attribute as a quoted string, so
// values may safely contain `>` (e.g. a CSS-path selector "div>div>div"). A
// naive `[^>]*?` would stop at the first `>` inside such a value and fail to
// match the whole tag. Values never contain `"` (sanitized at serialize time).
export const UI_CONTEXT_RE = /<ui-context(?:\s+[\w-]+="[^"]*")+\s*\/>/g;

export function parseUiContext(match: RegExpExecArray): UiContextMeta | null {
  const body = match[0];
  const get = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(body)?.[1];
  const url = get("url");
  const element = get("element");
  if (!url || !element) return null;
  return {
    url,
    element,
    pluginId: get("plugin"),
    slotId: get("slot"),
    paneId: get("pane"),
    selector: get("selector"),
  };
}
