import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * One gallery card: the prototype as listed, joined with whether the user has
 * marked it Done (`files`' `prototypes.statuses`). Joined once, in the gallery,
 * so the `done` field, the muted tone and every card action read the same value.
 */
export type PrototypeGalleryRow = PrototypeMeta & { done: boolean };

/**
 * Per-card actions in the gallery. The gallery ships one — the Done checkbox,
 * painted at rest — and anything else a card grows is a contribution.
 */
export const PrototypeCardActions = defineItemActions<PrototypeGalleryRow>();
