import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * The id kinds the data-view primitive mints in the browser, declared once
 * (`plugins/ids`). Both are `uuid`-shaped: they are minted client-side, often
 * several in one gesture, so a per-second stamp could collide.
 *
 * - `preset` — a saved sort or filter preset row (config). Rows minted as
 *   `preset-<uuid>` stay recognised; the normalizer's index fallback
 *   (`preset-<n>`, for a hand-written row with no id) is not an id of the kind
 *   and never was.
 * - `fnode` — a node of a filter tree (a group or a rule): a React key and an
 *   edit handle. Nodes minted before the kind are bare uuids and stay opaque
 *   keys; new mints are prefixed.
 */
export const presetIdKind = defineIdKind({
  prefix: "preset",
  label: "Data view preset",
  shape: "uuid",
});

export const filterNodeIdKind = defineIdKind({
  prefix: "fnode",
  label: "Filter node",
  shape: "uuid",
});

export type PresetId = IdOf<typeof presetIdKind>;
export type FilterNodeId = IdOf<typeof filterNodeIdKind>;
