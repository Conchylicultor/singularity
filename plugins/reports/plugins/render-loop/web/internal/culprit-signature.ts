import { RENDER_LOOP } from "../../core";

/**
 * The stable build/composition markers that survive a React teardown→rebuild
 * because they're keyed by plugin/slot/source identity, not React instance.
 * Re-implemented locally (not cross-plugin-imported from the element-picker's
 * private internals) per the boundary rules — it's a small, self-contained walk.
 */
export interface CulpritMeta {
  /** `pluginId@slotId | data-source | data-ui-owner | pane:<id> | boundedPath`. */
  signature: string;
  pluginId?: string;
  slotId?: string;
  contributionId?: string;
  source?: string;
  owner?: string;
  paneId?: string;
  selector?: string;
}

/**
 * The `display:contents` spans the slot middleware injects are not real layout
 * elements — they only carry markers (`data-slot-id`) — so they're skipped both
 * in the marker walks (to avoid mis-attributing to the middleware's own JSX) and
 * in the selector path (they add no box).
 */
function isMarkerSpan(el: Element): boolean {
  return el instanceof HTMLElement && el.dataset.slotId !== undefined;
}

/** The nearest `[data-plugin-id]` marker span above the element (skipping ""). */
function nearestMarker(
  el: Element,
): { pluginId?: string; slotId?: string; contributionId?: string } {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-plugin-id]");
    if (!m) break;
    const pluginId = m.dataset.pluginId;
    if (pluginId) {
      return {
        pluginId,
        slotId: m.dataset.slotId || undefined,
        contributionId: m.dataset.contributionId || undefined,
      };
    }
    cur = m.parentElement;
  }
  return {};
}

/** The nearest build-stamped `data-source` (`file:line`), skipping marker spans. */
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

/** The nearest `data-ui-owner` (`Name@file:line`), skipping marker spans. */
function nearestOwner(el: Element): string | undefined {
  let cur: Element | null = el;
  while (cur) {
    const m: HTMLElement | null = cur.closest<HTMLElement>("[data-ui-owner]");
    if (!m) return undefined;
    if (!isMarkerSpan(m)) return m.dataset.uiOwner;
    cur = m.parentElement;
  }
  return undefined;
}

/** This element's `nth-of-type` index among same-tag siblings (1-based). */
function nthOfType(el: Element): number {
  const tag = el.tagName;
  let n = 1;
  let sib: Element | null = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === tag) n += 1;
    sib = sib.previousElementSibling;
  }
  return n;
}

/**
 * A bounded `tagName:nth-of-type(k)` path from the node up to the nearest
 * stable-marker anchor (a `[data-plugin-id]` / `[data-source]` / pane host),
 * capped at PATH_MAX_DEPTH so two code blocks sharing one source line still
 * separate. Uses `nth-of-type` (NOT `nth-child`) so the index is robust to
 * sibling text/comment nodes that come and go during a rebuild.
 */
function boundedPath(el: Element): string {
  const segments: string[] = [];
  let cur: Element | null = el;
  while (cur && segments.length < RENDER_LOOP.PATH_MAX_DEPTH) {
    if (!isMarkerSpan(cur)) {
      const tag = cur.tagName.toLowerCase();
      segments.unshift(`${tag}:nth-of-type(${nthOfType(cur)})`);
    }
    // Stop once we reach a stable anchor: its identity is already in the prefix.
    if (
      cur.parentElement &&
      (cur.parentElement.hasAttribute("data-plugin-id") ||
        cur.parentElement.hasAttribute("data-source") ||
        cur.parentElement.hasAttribute("data-pane-id"))
    ) {
      break;
    }
    cur = cur.parentElement;
  }
  return segments.join(">");
}

/**
 * Resolve a mutation target (which may be a text node) to its parent element,
 * then compose the stable culprit signature.
 */
export function culpritMeta(node: Node): CulpritMeta {
  const el: Element | null =
    node instanceof Element ? node : node.parentElement;
  if (!el) {
    return { signature: "<detached>" };
  }

  const marker = nearestMarker(el);
  const source = nearestSource(el);
  const owner = nearestOwner(el);
  const paneId =
    el.closest<HTMLElement>("[data-pane-id]")?.dataset.paneId || undefined;
  const path = boundedPath(el);

  const pluginPart = marker.pluginId
    ? marker.slotId
      ? `${marker.pluginId}@${marker.slotId}`
      : marker.pluginId
    : "?";
  const parts = [
    pluginPart,
    source ?? "",
    owner ?? "",
    paneId ? `pane:${paneId}` : "",
    path,
  ];
  let signature = parts.join(" | ");
  if (signature.length > RENDER_LOOP.SIGNATURE_CAP) {
    signature = signature.slice(0, RENDER_LOOP.SIGNATURE_CAP);
  }

  return {
    signature,
    pluginId: marker.pluginId,
    slotId: marker.slotId,
    contributionId: marker.contributionId,
    source,
    owner,
    paneId,
    selector: path || undefined,
  };
}
