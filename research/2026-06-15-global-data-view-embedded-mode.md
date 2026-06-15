# Superseded — split into two plans

This combined draft has been split into two independently-executable plans:

- **Plan A — `2026-06-15-data-view-embedded-mode.md`**: the generic
  `mode: "surface" | "embedded"` placement axis on the `DataView` primitive.
- **Plan B — `2026-06-15-fields-tags-filter-and-community-browser-migration.md`**:
  a reusable multi-value `tags` filter field in the `fields` primitive, then the
  community-browser migration onto `DataView` (depends on Plan A).

The headless-toolbar axis from this draft was dropped: instead of routing around
the single-valued filter model, Plan B fixes it so `DataView` owns the full toolbar.
