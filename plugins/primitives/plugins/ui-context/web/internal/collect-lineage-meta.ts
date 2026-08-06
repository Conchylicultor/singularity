import { formatLineagePath, type UiContextMeta } from "../../core";
import { collectLineage } from "./collect-lineage";

/**
 * The ancestors-only meta builder: everything the lineage of `el` can honestly
 * claim, and nothing that is computed from `el` itself.
 *
 * `collectMeta` also fills `selector` / `source` / `owner`, all three read off
 * the element the caller hands in. That is right for a pick — the user pointed
 * at *that* element — and wrong for the other caller shape this exists for: an
 * error boundary's fallback, which is rendered by the boundary and whose own
 * `<Line>` is JSX in `crash-fallback.tsx`, so it carries
 * `data-source=".../crash-fallback.tsx:…"`. Emitting those three would name the
 * boundary as the crash site. The React-side answer (which component actually
 * threw) is already carried by the component stack, so there is nothing to
 * recover and no reason to guess.
 *
 * The ancestors, by contrast, are exactly the crash site: the fallback renders
 * in the crashed subtree's own position, so its lineage is the throwing
 * subtree's lineage. Keeping "which fields an ancestors-only walk may claim"
 * here rather than inlining three lines at the caller is the point — the
 * decision belongs to the plugin that owns the walk.
 *
 * `element` is supplied by the caller: an ancestors-only walk has no element of
 * its own to describe.
 */
export function collectLineageMeta(el: Element, element: string): UiContextMeta {
  const nodes = collectLineage(el);
  // Same rule as `collectMeta`: `plugin` / `slot` / `contribution` describe ONE
  // node — the innermost, of whatever kind — never a `plugin=` from one node
  // paired with a `slot=` inherited from another. The full truth is in `path`.
  const innermost = nodes[nodes.length - 1];
  const contribution = innermost?.kind === "contribution" ? innermost : undefined;
  return {
    url: window.location.href,
    pluginId: innermost?.pluginId,
    slotId: contribution?.slotId,
    contributionId: contribution?.contributionId,
    // Unconditional: `path` is the sole carrier of region information (which
    // pane / tab / window), so gating it on "adds more than the innermost node"
    // would drop that whenever the chain is one node long.
    path: formatLineagePath(nodes) || undefined,
    element,
  };
}
