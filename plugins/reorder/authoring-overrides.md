# Authoring reorder overrides

A reorderable slot's on-screen order must be a deliberate, committed layout — not the
non-deterministic natural order contributions happen to load in. So every reorderable slot
owes a **hand-curated** override; the `reorder:configs-authored` check enforces this (it
runs at build, including `--skip-checks` builds, not just at push). Authoring is
intentionally manual: a human decides the order.

Each reorderable slot has a generated `<slotId>.origin.jsonc` (the full catalog in
natural order) and an override `<slotId>.jsonc` that curates it. The
`reorder:configs-authored` check requires the override to exist.

To author: copy `.origin.jsonc` → `.jsonc` (same dir, drop `.origin`), keep the
leading `// @hash` line verbatim, and reorder the `items` array. Node forms:

- `"pluginId:id"` — a contribution, by entryKey.
- `{ "item": "pluginId:id", "hidden": true }` — remove it from the slot.
- `{ "spacer": "spacer-1" }` — a blank gap.

Order for the slot's actual layout — a sidebar, a toolbar, a pane section each
read differently (vertical list vs. horizontal bar vs. stacked blocks). Look at
how the slot renders and order for that context. **At most one spacer per slot.**

After editing, the `@hash` must match the origin — `./singularity build`
regenerates origins; reconcile and update the hash if it shifts.
