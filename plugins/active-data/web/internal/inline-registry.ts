import type { ComponentType } from "react";

/**
 * THE registry of active-data's inline chips, and the only factory that can
 * make one.
 *
 * ## Why a module registry at all, when `ActiveData.Tag` is already a registry
 *
 * Slot contributions are readable ONLY through a React hook — `bySlot` is built
 * inside `PluginProvider`'s `useMemo`. Every reader of a chip that is not a
 * React render (the Lexical hosts' headless registries, the runs↔doc
 * projection) therefore cannot see them at all. So the chips also live here, in
 * a plain module registry any caller can read.
 *
 * `ActiveData.Tag` stays the DECLARATION surface — it is what puts a chip in
 * `docs/plugins-details.md` and the reverse index — and {@link inlineChip} is
 * the only thing that can build the contribution it takes. The two halves are
 * sealed together the way `codeTag()` seals a code contribution's claim to its
 * renderer: one call both mints the contribution and records it, so a chip
 * cannot be declared-but-unrecorded, and it cannot be recorded twice.
 *
 * ## The brand is a REAL symbol
 *
 * `[INLINE_CHIP]` is set as an actual property on the returned object, so it
 * must be a value, not a `declare const` (which emits nothing and dies at
 * module eval). It is exported from this module so the interface can name it,
 * and deliberately NOT re-exported from `web/index.ts` — outside this plugin
 * there is no way to spell the key, so hand-writing
 * `ActiveData.Tag({ display: "inline", … })` is a tsc error and unforgeable at
 * runtime too.
 */

/**
 * Where a chip belongs. REQUIRED on every chip, with no default.
 *
 * This is how a chip that has no business in a page — `<ui-context>`, which is
 * a transcript affordance, or `block-…`, whose token overlaps the page editor's
 * own `[[page:…]]` — stays out of Pages without any consumer naming a
 * contributor. The chip declares where it belongs; the host asks for its own
 * surface (`inlineChips("document")`) and gets exactly the chips that said yes.
 *
 * - `"transcript"` — conversation surfaces: assistant markdown, user text, the
 *   prompt editor.
 * - `"document"` — page content: the block editor and every read-only rendering
 *   of a page's runs.
 */
export type ChipSurface = "transcript" | "document";

// See the module header: a real symbol, unreachable outside this module.
export const INLINE_CHIP: unique symbol = Symbol("active-data-inline-chip");

/**
 * INVARIANT — inline patterns must be SELF-CERTIFYING: the pattern alone is the
 * truth. An inline chip renders unconditionally on every match (unknown ids
 * degrade in-chip), because the same registry drives every surface at once —
 * markdown, plain text, and the Lexical editors, where every inline pattern is
 * compiled into ONE union feeding a single generic node. A "declined" token
 * there would still be a committed node in the user's document; there is no
 * host to render a fallback.
 *
 * So: a pattern whose validity requires I/O belongs in `display:"code"`, which
 * has a real claim protocol (see `../claim`). Namespaced prefixes (`att-`,
 * `conv-`, `task-`, `proto-`) are the shape that qualifies as inline.
 *
 * Build one with {@link inlineChip} — there is no other way.
 */
export interface ActiveDataInlineContribution {
  readonly [INLINE_CHIP]: true;
  display: "inline";
  /**
   * Stable id, unique across every inline chip.
   *
   * Explicit rather than derived from the owning plugin because `PluginProvider`
   * COPIES each contribution to stamp `_pluginId` onto it — the object held here
   * is the pre-copy original and never receives one. This id is what names the
   * chip in an error boundary's fallback and in the docs.
   */
  id: string;
  pattern: RegExp;
  surfaces: readonly ChipSurface[];
  component: ComponentType<{
    content: string;
    attrs: Record<string, string>;
  }>;
}

const chips: ActiveDataInlineContribution[] = [];

/**
 * THE way to declare an inline chip: mints the contribution AND records it.
 *
 * ```ts
 * ActiveData.Tag(inlineChip({ id, pattern, surfaces, component }))
 * ```
 *
 * A duplicate id THROWS rather than winning or losing silently: two chips
 * sharing an id would be indistinguishable in an error boundary's fallback and
 * in the docs, and the second registration is always a mistake (an id is a
 * literal in a barrel, so the only way to reach one twice is to declare it
 * twice).
 */
export function inlineChip(spec: {
  id: string;
  pattern: RegExp;
  surfaces: readonly ChipSurface[];
  component: ComponentType<{ content: string; attrs: Record<string, string> }>;
}): ActiveDataInlineContribution {
  const existing = chips.find((c) => c.id === spec.id);
  if (existing) {
    throw new Error(
      `[active-data] two inline chips declare the id "${spec.id}" ` +
        `(/${existing.pattern.source}/ and /${spec.pattern.source}/). An id names ` +
        `the chip in its error boundary and in the docs, so it must be unique.`,
    );
  }
  const chip: ActiveDataInlineContribution = {
    [INLINE_CHIP]: true,
    display: "inline",
    id: spec.id,
    pattern: spec.pattern,
    surfaces: spec.surfaces,
    component: spec.component,
  };
  chips.push(chip);
  return chip;
}

/**
 * The chips that declared this surface, in declaration order.
 *
 * Read at CALL time, never memoized: chips register progressively as the plugin
 * tiers load, and a snapshot taken too early silently under-reports — the token
 * then renders as plain characters, with nothing failing.
 */
export function inlineChips(
  surface: ChipSurface,
): readonly ActiveDataInlineContribution[] {
  return chips.filter((c) => c.surfaces.includes(surface));
}

/**
 * The chip whose pattern matches `token` WHOLE, or null.
 *
 * Anchored, so a shorter pattern that merely appears *inside* a longer token (a
 * `conv-…` id embedded in a `<ui-context …>` tag) never wins over the token that
 * actually produced the match. The `g` flag is stripped: `lastIndex` is stateful
 * and this is a one-shot test.
 *
 * Deliberately NOT surface-scoped. A token only ever reaches here because some
 * surface's own extension matched it, and the answer to "which chip owns these
 * characters" cannot depend on who is asking.
 */
export function inlineChipFor(
  token: string,
): ActiveDataInlineContribution | null {
  return (
    chips.find((c) =>
      new RegExp(
        `^(?:${c.pattern.source})$`,
        c.pattern.flags.replace("g", ""),
      ).test(token),
    ) ?? null
  );
}
