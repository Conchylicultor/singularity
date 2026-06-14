// Grandfathered reorder config overrides — reorderable slots exempt from the
// `reorder:configs-authored` check despite lacking an authored override.
//
// Fully burned down: every reorderable slot now has an authored override, so
// this list is empty. Keep it that way — a newly added reorderable slot must
// ship a curated override (see plugins/reorder/authoring-overrides.md) or — if
// it is headless and never user-curated — be declared with `defineMountSlot`
// instead of `defineRenderSlot`. Do NOT add paths here to silence the check.
//
// Each entry, if any, is an override's repo-relative path
// (`config/<asPath(pluginId)>/<slotId>.jsonc`). The check fails on redundant
// entries (override exists AND still listed), so the list can only shrink.
export const grandfatheredSlots: string[] = [];
