/**
 * A host registry that folds in LAZY SOURCES, read at call time.
 *
 * Every Lexical host in the app keeps one registry of the inline token families
 * it knows about — `registerNodeExtension` in the prompt editor,
 * `registerBlockTextExtension` in the page editor. Both need the same second
 * kind of entry: not an item, but a FUNCTION that produces items when asked.
 *
 * ## Why a source and not just an item
 *
 * A plugin whose token set is itself a registry (active-data's inline chips)
 * cannot hand over a finished list at module eval: the chips register
 * progressively as the plugin tiers load, so a snapshot taken by whoever
 * happens to evaluate first silently under-reports and the host renders those
 * tokens as plain characters forever. Registering the LOOKUP instead moves the
 * read to the moment the answer is used.
 *
 * That is also why {@link SourcedRegistry.all} must never be memoized by its
 * callers — the page editor's seed/projection pair already states this rule for
 * itself (`blockTextRunsOptions`), and the reason is the same one: two readers
 * that snapshot at different moments disagree about the token set, and a block
 * seeded with one set and read back with the other round-trips a decorator into
 * plain characters.
 *
 * ## Why this lives HERE, in the token primitive
 *
 * Two hosts need it and the two are deliberately kept separate (a page block
 * must not get `<ui-context>`; a prompt draft must not get `[[page:…]]`), so
 * writing it twice was the alternative. Two copies would be two statements of
 * the call-time rule above, and that rule is the whole content of this module —
 * the code is a dozen lines, the invariant is the artifact. `token-extension`
 * is the one plugin both hosts already import for exactly this contract, so
 * siting it here keeps registry shape and token contract in one place.
 *
 * Generic in the item because the two hosts store different things: the prompt
 * editor stores an {@link InlineTokenExtension} directly, the page editor stores
 * a `BlockTextExtension` (an extension plus an optional Lexical Plugin). What
 * they share is the entry model, not the payload.
 */

type Entry<T> =
  | { item: T; source?: undefined }
  | { item?: undefined; source: () => readonly T[] };

export interface SourcedRegistry<T> {
  /** Register one item. Returns its unregister. */
  register(item: T): () => void;
  /**
   * Register a LOOKUP called on every {@link all}. Returns its unregister.
   *
   * The source is called on each read, so it may legitimately answer
   * differently over time. It should return STABLE objects for entries that
   * have not changed: a consumer that derives something per item (the page
   * editor mints an `InlineTokenExtension` per registration) keys that
   * derivation on object identity, and a source minting fresh objects every
   * call defeats it.
   */
  registerSource(source: () => readonly T[]): () => void;
  /**
   * Every item, in registration order, with each source expanded in place.
   *
   * Read at CALL time, never memoized — see the module header.
   */
  all(): readonly T[];
}

export function createSourcedRegistry<T>(): SourcedRegistry<T> {
  // One list for both kinds, so `all()` preserves the order things were
  // registered in rather than putting sources after items — pattern precedence
  // in a host is registration order, and it should not depend on which of the
  // two calls a contributor happened to use.
  const entries: Entry<T>[] = [];

  const remove = (entry: Entry<T>) => () => {
    const idx = entries.indexOf(entry);
    if (idx >= 0) entries.splice(idx, 1);
  };

  return {
    register(item: T): () => void {
      const entry: Entry<T> = { item };
      entries.push(entry);
      return remove(entry);
    },
    registerSource(source: () => readonly T[]): () => void {
      const entry: Entry<T> = { source };
      entries.push(entry);
      return remove(entry);
    },
    all(): readonly T[] {
      const out: T[] = [];
      for (const entry of entries) {
        if (entry.source) out.push(...entry.source());
        else out.push(entry.item);
      }
      return out;
    },
  };
}
