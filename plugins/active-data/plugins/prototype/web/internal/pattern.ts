import { inlineBoundary } from "@plugins/active-data/core";
import { PROTOTYPE_ID_RE } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * A prototype id (`proto-1786877040-w2vi`) written BARE in assistant prose.
 *
 * **Why this one imports the shape where `attempt` and `page-link` re-type it.**
 * Those two spell the id's format out again in their own `pattern.ts`, which
 * means the mint and the chip are two independent declarations of one format:
 * change the mint and every chip silently stops matching, with nothing failing —
 * `page-link`'s docblock says exactly that, and it has already happened once
 * (the retired `block-\d+-[a-z0-9]{4,8}` shape). A prototype id answers it the
 * other way: `files/core/id.ts` is the ONE spelling, the mint and
 * `isPrototypeId()` read it too, and its own `id.test.ts` pins the mint against
 * it. So there is nothing here to drift.
 *
 * `PROTOTYPE_ID_RE` is deliberately exported unanchored and without `g` — the
 * core shape, not a matcher — so each reading composes its own guards.
 * `inlineBoundary` adds this reading's: no leading `/` and no trailing `/` or
 * `.`, so a bare id in a sentence linkifies while `~/…/proto-…/index.html` in a
 * path does not.
 *
 * No extra trailing guard is needed (unlike `page-link`'s `(?![0-9a-z-])`): the
 * suffix here is a fixed `{4}` and the digits must be followed by `-`, so
 * nothing in the shape can backtrack into a shorter match to satisfy the
 * boundary lookahead.
 */
export const PROTOTYPE_INLINE_RE = inlineBoundary(PROTOTYPE_ID_RE);
