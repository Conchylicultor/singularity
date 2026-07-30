import type { ComponentType } from "react";
import type { AnyZodObject, z } from "zod";
import {
  defineBlock,
  type BlockHandle,
  type BlockMarkdown,
} from "@plugins/page/plugins/editor/core";

/**
 * The type-level rejection of a text-bearing container: `unknown` (a no-op
 * intersection member) for a void schema, and an object carrying an
 * impossible-to-supply property for a schema whose shape declares `text`, so the
 * call site fails with "Property
 * `__void_container_schema_must_not_declare_text` is missing".
 *
 * This is the same fact `defineBlock` derives `acceptsText` from at runtime
 * (`"text" in schema.shape`), restated in the type system so a text-bearing
 * container is a COMPILE error rather than a runtime surprise. It rejects both
 * ways of becoming text-bearing:
 *
 * - `textBlockSchema({})` — the branded factory every text block composes; its
 *   shape declares `text`;
 * - a hand-rolled `z.object({ text: … })`, which carries no `TextBearingSchema`
 *   brand at all and would slip past a brand-only check while still being
 *   text-bearing at runtime.
 *
 * Keying on the shape rather than on the brand is deliberate: the shape is what
 * the runtime derivation reads, so the compile-time and runtime answers cannot
 * disagree. `S = any` (a dynamically built schema) fails CLOSED — `keyof any`
 * includes `"text"` — which is the safe direction, and the runtime guard below
 * then reports it properly.
 *
 * A conditional intersection member rather than a constraint on `S`:
 * intersecting `AnyZodObject` with a narrowed `shape` breaks assignability
 * outright (zod's `keyof()._cache` is derived from the shape, so `Set<"color" |
 * …>` stops being assignable to `Set<never>`) and rejects every schema,
 * including void ones.
 */
export type RejectTextBearing<S extends AnyZodObject> = "text" extends keyof S["shape"]
  ? { __void_container_schema_must_not_declare_text: never }
  : unknown;

/**
 * The declaration surface of a void container. Deliberately much smaller than
 * `defineBlock`'s: everything a container cannot coherently declare is simply
 * absent, so an inconsistent container is unrepresentable rather than merely
 * discouraged.
 *
 * Forced by the factory (not accepted here): `anchor`, `collapsible: "never"`,
 * `wrapOnConvert`.
 *
 * Absent because an anchor renders no line of its own, so they would be inert:
 * `placeholder`, `marker` / `ordinalMarker`, `textVariant`,
 * `gutterFirstLineCenter` (the surface seats the decoration on the first
 * child's borrowed line), `splitInto` / `splitChildWhenExpanded` /
 * `dataOnSplit` (a void row never splits), `resetToOnBackspaceAtStart` /
 * `breakOutOnEmptyEnter` (no caret can originate in it), `toggle`,
 * `defaultText`, and `markdownPrefixes` (a void type derives no parser from
 * them — see `markdown.ts`'s `parserFor`).
 */
export interface ContainerBlockOptions<S extends AnyZodObject> {
  /** The block type id, e.g. `"callout"`. */
  type: string;
  /** The container's appearance-only payload. Must not declare `text`. */
  schema: S;
  /** Insert-menu label. A container without one is not offered in the palette. */
  label?: string;
  /** Insert-menu icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Alternate insert-menu search terms. */
  aliases?: string[];
  /** The default payload for a freshly inserted container. */
  empty?: () => z.infer<S>;
  /**
   * Per-type markdown. A void container has no text of its own, so the central
   * orchestrator's default is a blank line and its children carry the content;
   * declare this only to emit a structural marker line.
   */
  markdown?: BlockMarkdown<z.infer<S>>;
}

/**
 * Define a VOID CONTAINER block type: one that owns no text at all, whose
 * displayed content IS its children.
 *
 * The three container facts are FORCED here rather than copied per block type,
 * because they are not independent — each one is load-bearing for the others,
 * and the `/context` regression this factory was extracted from was exactly the
 * result of declaring them piecemeal:
 *
 * - **`anchor: true`** — the type renders no line. The surface collapses its row
 *   to zero height while it has visible children and paints its decoration in
 *   the indent gutter; the pure reducer reads the same fact
 *   (`BlockOpContext.anchorTypes`) for its split/merge refusals and the
 *   childless-anchor prune. Because the container owns no line, converting its
 *   first child to a heading cannot touch it, and Enter in a child is a plain
 *   sibling split rather than a second container.
 * - **`collapsible: "never"`** — an anchor has no chevron, so a stored
 *   `expanded: false` (which `applySplit`, `applyInsert` and any patch replay
 *   all mint) would hide its children behind nothing. The flatten therefore
 *   treats these types as expanded regardless of the flag: making it INERT is a
 *   guarantee, "every creation path sets it true" is not.
 * - **`wrapOnConvert: true`** — `/<container>` on an existing block WRAPS it:
 *   the origin keeps its id, type, `data` and children and becomes the anchor's
 *   first child. A void type has nowhere to put the retyped block's text, so a
 *   swap would silently drop it; and keeping the origin's id is what keeps the
 *   caret still (its content `Y.Doc`, its `Y.UndoManager` and its registered
 *   focus handle are all keyed by block id). It is also what lets the
 *   container's first visible line be a heading, a to-do, an image or a code
 *   block.
 *
 * The runtime guard is belt-and-braces for a caller reaching this through
 * `any` (a JS caller, a dynamically built schema): the type-level constraint
 * already rejects a text-bearing schema, and this makes the failure loud at
 * module eval instead of silently minting a text-bearing container.
 */
export function defineContainerBlock<S extends AnyZodObject>(
  opts: ContainerBlockOptions<S> & RejectTextBearing<S>,
): BlockHandle<z.infer<S>> {
  if ("text" in opts.schema.shape) {
    throw new Error(
      `defineContainerBlock("${opts.type}"): a container is a VOID block — its schema must not ` +
        "declare `text`. Its content IS its children; a text-bearing container fuses container " +
        "identity with a line of content, which is the exact model this primitive replaces.",
    );
  }
  // The guard member carries no data — drop it by widening to the declaration
  // surface, so the forwarding stays a spread and a new option needs no edit here.
  const declared: ContainerBlockOptions<S> = opts;
  return defineBlock({
    ...declared,
    anchor: true,
    collapsible: "never",
    wrapOnConvert: true,
  });
}
