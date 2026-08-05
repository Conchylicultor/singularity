/**
 * The hand-authoring legend for a `ReorderTree` — one line per node form an
 * agent may write into a slot's config.
 *
 * ONE copy, two consumers: the generated `*.origin.jsonc` comment block
 * (`reorderable-slots-gen.ts`) and the `requiresAuthoredOverride` guidance the
 * `config:overrides-authored` check echoes back (`reorder/shared/directive.ts`).
 * They were two hardcoded lists and had already drifted apart.
 *
 * It lives here, with the tree format, rather than being derived from the live
 * node-type registry: that registry is web-only, so the build-time codegen would
 * need a barrel import per node-type plugin to read it. Adding a node type means
 * adding its line here — see `reorder/node-types`' "Adding a node type".
 */
export const REORDER_NODE_LEGEND: readonly string[] = [
  'Item: "<key>" (terse; <key> is "<pluginId>:<id>")',
  'Hide: { "item": "<key>", "hidden": true }',
  'Spacer (gap): { "type": "spacer", "id": "<unique-id>" }',
  'Group: { "type": "header", "label": "<title>", "collapsed": false, "items": [ "<key>", … ] }',
  'Overflow (⋯ menu): { "type": "overflow", "id": "<unique-id>", "items": [ "<key>", … ] }',
];
