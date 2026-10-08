import type { IdChipSurface } from "@plugins/active-data/plugins/id-chip/core";

/**
 * Where a block chip belongs — TRANSCRIPT ONLY. A page already has a
 * first-class link to a block — the editor's own `[[page:<id>]]` token — and
 * this pattern would match the same ids inside it, so two token families would
 * compete for one span. In a conversation there is no such token and a bare
 * `block-…` is the only spelling, so the chip earns its keep there. Read by
 * BOTH halves, so the server never registers a page-editor token for it.
 */
export const BLOCK_CHIP_SURFACES: readonly IdChipSurface[] = ["transcript"];
