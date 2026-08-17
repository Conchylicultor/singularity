import { inlineBoundary } from "@plugins/active-data/core";

// A block id (`block-<uuid>`) written BARE in assistant prose, with no
// delimiter around it — so unlike the page editor's `[[page:<id>]]` token there
// is no namespace to key on, and this one genuinely has to match on shape.
//
// That makes it the one place a block id's format is parsed, against the mint's
// own rule that it must not be (`page/editor/core/block-id.ts`). Keep the shape
// as LOOSE as a bare-token match allows: `block-` plus at least two
// hyphen-separated alphanumeric groups covers the current uuid mint and the
// retired `block-<epochMillis>-<base36>` form alike, so a future mint change
// does not silently switch every chip back off. `pattern.test.ts` pins it to
// `newBlockId()` so a change that DOES break it fails loudly.
//
// Pages and content blocks share one id space — the pattern cannot tell them
// apart, and the chip does not try: it resolves whichever kind it got to the
// page that displays it.
//
// The trailing `(?![0-9a-z-])` is load-bearing, not decoration: `inlineBoundary`
// appends `(?![/.])\b`, and without it a greedy group BACKTRACKS to satisfy
// that guard — so `block-<uuid>/web` would match all but the uuid's last group
// and linkify a path segment as an id.
export const BLOCK_ID_RE = inlineBoundary(
  /block-[0-9a-z]+(?:-[0-9a-z]+)+(?![0-9a-z-])/,
);
