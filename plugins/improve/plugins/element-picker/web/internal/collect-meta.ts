import type { UiContextMeta } from "../../core";
import { findPluginContext } from "./find-plugin-context";

const MAX_LABEL = 60;

function truncate(s: string, max = MAX_LABEL): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** A human label for the element: tag + the best available accessible text. */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const label =
    el.getAttribute("aria-label") ||
    (el as HTMLElement).title ||
    el.textContent ||
    "";
  const trimmed = truncate(label);
  return trimmed ? `${tag} — ${trimmed}` : tag;
}

/** A short ancestor CSS path (up to 4 segments), tag names only. */
function shortSelector(el: Element): string {
  const segments: string[] = [];
  let cur: Element | null = el;
  while (cur && segments.length < 4 && cur !== document.body) {
    segments.unshift(cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return segments.join(">");
}

export function collectMeta(el: Element): UiContextMeta {
  const { pluginId, slotId, paneId } = findPluginContext(el);
  return {
    url: window.location.href,
    pluginId,
    slotId,
    paneId,
    element: describeElement(el),
    selector: shortSelector(el),
  };
}
