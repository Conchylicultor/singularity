// THE one spelling of a prototype's id format — the mint, the folder-name
// validation and the chip's inline pattern all read it from here.
//
// A prototype's id IS its directory name, so the filesystem is the uniqueness
// authority and the mint is a `mkdir`: there is no dir↔id map in front of the
// routes, the watcher, the thumbnail cache or the backup source. It is opaque
// rather than a slug because the folder is minted BEFORE the agent has designed
// anything — any name chosen at that moment is a guess, and renaming later would
// change the id, which is the one thing an id exists to prevent. Nothing is lost
// to a human: every surface that displays a prototype reads `meta.title` out of
// its `<title>`.
//
// **Why one module rather than a shape re-typed per consumer.** `att-` and
// `block-` are the precedent NOT to follow: their chips re-declare the id shape
// in `active-data/plugins/*/web/internal/pattern.ts`, so a change to the mint
// silently switches every chip off with nothing failing — `page-link`'s own
// docblock says exactly that, and `block-id.ts` answers it by forbidding parsing
// altogether. A prototype id has to be parsed (a bare id in assistant prose is
// the whole point of the chip), so the answer here is the other one: parse it,
// but from a single exported regex, pinned to the mint by `id.test.ts`.
//
// `core/` is browser-importable, so this module stays dependency-free.

/**
 * Mint a fresh prototype id: `proto-<epochSeconds>-<4 base36 chars>`.
 *
 * The shape `newId()` already mints for attempts and conversations
 * (`conversations/server/internal/lifecycle.ts`), with one deliberate
 * difference: the suffix is drawn as an integer and zero-padded to exactly four
 * characters, where `newId` slices four off `Math.random().toString(36)` and so
 * yields a SHORTER suffix for the rare double with few significant base-36
 * digits (`0.5` → `"i"`). Cosmetic for an attempt id, which nothing validates;
 * a real bug here, where the id is checked by {@link isPrototypeId} on every
 * folder read and matched by the chip's pattern in every assistant message.
 */
export function newPrototypeId(): string {
  const suffix = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `proto-${Math.floor(Date.now() / 1000)}-${suffix}`;
}

/**
 * The id's CORE shape, unanchored and with no `g` flag — a fragment to compose,
 * not a matcher to use directly.
 *
 * Consumers add their own guards: {@link isPrototypeId} anchors it to a whole
 * string, and the active-data chip wraps it in `inlineBoundary()` so a bare id
 * in prose linkifies while `proto-…/index.html` in a path does not. Keeping the
 * boundaries OUT of here is what lets both readings share one shape.
 */
export const PROTOTYPE_ID_RE = /proto-\d+-[a-z0-9]{4}/;

/** Is this whole string a minted prototype id (⇒ a legal folder name)? */
export function isPrototypeId(name: string): boolean {
  return new RegExp(`^(?:${PROTOTYPE_ID_RE.source})$`).test(name);
}

/**
 * What a prototype is called when its `index.html` has no `<title>`.
 *
 * The lister used to fall back to the directory name, which read fine while
 * that was a slug (`ember`) and reads as nothing at all now that it is a minted
 * id. It lives beside the id rather than in the lister because the reason it
 * exists is the id's opacity, and because the surfaces that display a title —
 * the gallery card, the pane header, the chip — must agree on the answer; the
 * chip in particular cannot be left to spot the fallback and relabel it, which
 * is a per-surface patch on a single-source problem.
 *
 * It is also the `<title>` the blank template ships, so a freshly minted
 * prototype reads the same before its first save as one whose title was
 * deleted.
 */
export const UNTITLED_PROTOTYPE = "Untitled prototype";
