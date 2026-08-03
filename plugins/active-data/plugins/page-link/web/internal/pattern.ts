import { inlineBoundary } from "@plugins/active-data/core";

// Server-minted block ids (`block-<epoch-ms>-<base36>`). Pages and content
// blocks share one id space — the pattern cannot tell them apart, and the chip
// does not try to: it resolves whichever kind it got to the page that displays
// it. Client-minted content blocks carry UUIDs, which are deliberately NOT
// matched: a bare UUID in prose is far more often something else.
export const BLOCK_ID_RE = inlineBoundary(/block-\d+-[a-z0-9]{4,8}/);
