import type {
  ContributionNode,
  LineageNode,
  RegionNode,
} from "../../core";

/**
 * The DOM attribute grammar for the UI-context lineage — producers and the walk
 * in ONE file, so the two can never drift.
 *
 * ```
 * data-lineage="contribution"   data-plugin-id data-slot-id data-contribution-id
 * data-lineage="region"         data-region-kind data-region-id data-region-label data-plugin-id
 * ```
 *
 * `data-lineage` is both the discriminator and the single walk selector, so the
 * walk stays one `closest()` per level. Flat attributes beat a JSON payload:
 * the inspector shows `data-region-id="…"` at a glance, existing
 * `data-plugin-id` / `data-slot-id` assertions survive byte-identical, and
 * there is no `JSON.parse` per ancestor level on the click path.
 */
export const NODE_ATTR = "data-lineage";

/** The DOM attribute a portal surface re-stamps the originating tree's full
 * outer→inner lineage onto. The `display:contents` marker spans live in the
 * source tree, but a portal relocates content to `document.body` and severs that
 * ancestry — so the lineage rides the portal-forward bridge as this serialized
 * attribute and is re-stamped on the portaled positioner. */
export const LINEAGE_ATTR = "data-plugin-lineage";

export interface ContributionNodeAttrs {
  "data-lineage": "contribution";
  "data-plugin-id": string;
  "data-slot-id": string;
  "data-contribution-id": string;
}

export interface RegionNodeAttrs {
  "data-lineage": "region";
  "data-region-kind": string;
  "data-region-id": string;
  "data-region-label"?: string;
  "data-plugin-id"?: string;
}

/** Spreadable attributes marking a `display:contents` span as one contribution
 *  node. The three contribution attributes are always present (empty string when
 *  the field is absent), matching what the slot-item middleware has always
 *  stamped — existing `[data-plugin-id]` assertions stay byte-identical. */
export function contributionNodeAttrs(n: ContributionNode): ContributionNodeAttrs {
  return {
    "data-lineage": "contribution",
    "data-plugin-id": n.pluginId,
    "data-slot-id": n.slotId ?? "",
    "data-contribution-id": n.contributionId ?? "",
  };
}

/** Spreadable attributes marking a `display:contents` span as one region node. */
export function regionNodeAttrs(n: RegionNode): RegionNodeAttrs {
  return {
    "data-lineage": "region",
    "data-region-kind": n.regionKind,
    "data-region-id": n.id,
    "data-region-label": n.label || undefined,
    "data-plugin-id": n.pluginId || undefined,
  };
}

/**
 * Read one lineage node off a marker element, or `null` when the element
 * carries no usable identity.
 *
 * The skip rule applies to **contributions only**: the middleware stamps
 * `data-plugin-id=""` when a contribution has no plugin id, and such a node
 * says nothing, so it is dropped. A region with no owning plugin IS still
 * collected — its identity (`kind` + `id` + position) is the whole point, and
 * the plugin is the optional part.
 *
 * An unrecognized `data-lineage` value throws rather than being skipped: the
 * attribute is written only by the two producers in this plugin, so an unknown
 * value is real corruption to surface, not an absence to absorb.
 */
export function readLineageNode(el: HTMLElement): LineageNode | null {
  const kind = el.dataset.lineage;
  if (kind === "contribution") {
    const pluginId = el.dataset.pluginId;
    if (!pluginId) return null;
    return {
      kind: "contribution",
      pluginId,
      slotId: el.dataset.slotId || undefined,
      contributionId: el.dataset.contributionId || undefined,
    };
  }
  if (kind === "region") {
    return {
      kind: "region",
      regionKind: el.dataset.regionKind ?? "",
      id: el.dataset.regionId ?? "",
      label: el.dataset.regionLabel || undefined,
      pluginId: el.dataset.pluginId || undefined,
    };
  }
  throw new Error(
    `Unknown ${NODE_ATTR} value ${JSON.stringify(kind)} — the attribute is written only by ui-context's producers.`,
  );
}

/** True when the node carries enough identity to be worth a chain entry. A
 *  contribution needs its plugin; a region needs its kind and id. */
function hasIdentity(node: LineageNode): boolean {
  return node.kind === "contribution"
    ? Boolean(node.pluginId)
    : Boolean(node.regionKind && node.id);
}

/** Collapse empty-string optionals to `undefined` so `JSON.stringify` drops
 *  them — producers hand us `""` for "absent" (that is what the DOM attributes
 *  carry), and a serialized `""` would read back as a present-but-blank field. */
function normalizeNode(node: LineageNode): LineageNode {
  if (node.kind === "contribution") {
    return {
      kind: "contribution",
      pluginId: node.pluginId,
      slotId: node.slotId || undefined,
      contributionId: node.contributionId || undefined,
    };
  }
  return {
    kind: "region",
    regionKind: node.regionKind,
    id: node.id,
    label: node.label || undefined,
    pluginId: node.pluginId || undefined,
  };
}

/** Append one node to a serialized lineage (the value carried on
 * {@link LINEAGE_ATTR}). Nodes with no identity are skipped, mirroring the DOM
 * walk's skip rule, so the chain only ever carries real entries. */
export function appendLineage(
  serialized: string | undefined,
  node: LineageNode,
): string | undefined {
  if (!hasIdentity(node)) return serialized;
  return JSON.stringify([...parseLineage(serialized), normalizeNode(node)]);
}

/** Parse a serialized lineage back into nodes (outer→inner). Not wrapped in a
 * try/catch: the value is always written by {@link appendLineage}, so a parse
 * failure is a real corruption we want to surface, not swallow. */
export function parseLineage(serialized: string | undefined): LineageNode[] {
  if (!serialized) return [];
  return JSON.parse(serialized) as LineageNode[];
}
