import type { UiContextMeta } from "../../core";
import { collectMarkerLineage, type UiMarker } from "./marker-lineage";

const MAX_LABEL = 60;

function truncate(s: string, max = MAX_LABEL): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The element's own direct text, ignoring nested children. A button whose label
 * lives in a child span yields "" here, so we fall back to subtree text only as a
 * last resort — this keeps container clicks from capturing a whole subtree's text. */
function ownText(el: Element): string {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? "";
  }
  return s.trim();
}

/** A human label for the element: tag (+ role) + the best available accessible text. */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  const head = role ? `${tag}[role=${role}]` : tag;
  const label =
    el.getAttribute("aria-label") ||
    (el as HTMLElement).title ||
    el.getAttribute("placeholder") ||
    ownText(el) ||
    el.textContent ||
    "";
  const trimmed = truncate(label);
  return trimmed ? `${head} — ${trimmed}` : head;
}

/** The `display:contents` spans the slot middleware injects are not real layout
 * elements — they only carry markers — so they're skipped in the selector path. */
function isMarkerSpan(el: Element): boolean {
  return el instanceof HTMLElement && el.dataset.slotId !== undefined;
}

/** The nearest build-stamped `data-source` (repo-relative `file:line`) above the
 * element, skipping the marker middleware's own `display:contents` span — that span
 * is JSX in marker-middleware.tsx so it ALSO carries a `data-source` pointing at the
 * middleware, which would mis-attribute every pick. */
function nearestSource(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-source]");
    if (!m) return undefined;
    if (!isMarkerSpan(m)) return m.dataset.source;
    cur = m.parentElement;
  }
  return undefined;
}

/** One selector segment: prefer a stable, unique anchor (id, then test id) and
 * otherwise fall back to the bare tag name. */
function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${CSS.escape(el.id)}`;
  const testid = el.getAttribute("data-testid");
  if (testid) return `${tag}[data-testid="${testid}"]`;
  return tag;
}

/** A CSS path (up to 6 real segments) from the element up its ancestors, anchored
 * with ids / test ids where available so the agent can actually locate the node. */
function preciseSelector(el: Element): string {
  const segments: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && segments.length < 6) {
    if (!isMarkerSpan(cur)) segments.unshift(segmentFor(cur));
    cur = cur.parentElement;
  }
  return segments.join(">");
}

/** Render the outer→inner marker chain as "plugin@Slot > plugin@Slot". */
function formatPath(markers: UiMarker[]): string {
  return markers
    .map((m) => (m.slotId ? `${m.pluginId}@${m.slotId}` : m.pluginId))
    .join(" > ");
}

export function collectMeta(el: Element): UiContextMeta {
  const { markers, paneId } = collectMarkerLineage(el);
  const innermost = markers[markers.length - 1];
  return {
    url: window.location.href,
    pluginId: innermost?.pluginId,
    slotId: innermost?.slotId,
    contributionId: innermost?.contributionId,
    paneId,
    // Only emit the path when it adds something beyond plugin/slot (>1 marker).
    path: markers.length > 1 ? formatPath(markers) : undefined,
    element: describeElement(el),
    selector: preciseSelector(el),
    source: nearestSource(el),
  };
}
