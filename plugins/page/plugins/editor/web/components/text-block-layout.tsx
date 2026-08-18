import type { ReactNode } from "react";
import {
  cn,
  SURFACE_LEVELS,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Inset,
  insetClass,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { semanticsAttrs, type BlockSemantics } from "../../core";
import { BLOCK_INSET, MARKER_GUTTER } from "../internal/page-column";
import type { BlockChrome, BlockRegion, BlockRegionProps } from "../types";

/**
 * The FIXED element skeleton every text-bearing block is rendered into, on both
 * surfaces — only the leaf differs (`<BlockTextEditor>` in the editor,
 * `<RunsRenderer>` in the read-only view), so it is `children`.
 *
 * ## The constraint the whole design rests on
 *
 * React unmounts when the element **TYPE at a position** changes. So:
 *
 * > The chain of element types from this root down to `<LexicalComposer>` must be
 * > constant — independent of `block.type`. Props, classNames and styles may vary
 * > freely. Anything that is not an ancestor of the composer may vary freely.
 *
 * A block type may therefore **style** elements that always exist (`BlockChrome`)
 * and contribute **siblings** of the editable line (`BlockChrome.regions`). It may
 * never wrap it — and it cannot, because a region receives no `children`. That is
 * what makes `/quote` and `/prompt` a re-style rather than a remount: the live
 * Lexical instance, its Yjs binding, its focus and the user's caret all survive.
 * (`main` reached the same principle independently on the container axis — see
 * `BlockFrameProps`: "a BACKDROP, not a wrapper".)
 *
 * ## Three totality rules, or the bug comes back
 *
 * 1. **Every skeleton element renders unconditionally.** `Inset` always renders
 *    its element and never collapses to a Fragment on empty props — that is
 *    *luck, not design*, so no skeleton element may be a primitive that could
 *    start vanishing. This is also why the box, the line and the leaf cell are
 *    raw `div`s rather than `Surface`/`Stack`/`Fill`: their element structure is
 *    load-bearing here, and a primitive is free to change its own internals.
 * 2. **Each region occupies exactly ONE children-array slot** (a ternary down to
 *    `null`), never something that changes the array's length. React pairs
 *    unkeyed siblings by `fiber.index`; a length change mis-pairs the leaf cell
 *    against a region div and remounts Lexical.
 * 3. **Nothing in the chain may key or branch on `block.type`.**
 */
export interface TextBlockLayoutProps {
  /** The matched block type's presentation, or undefined for the plain default. */
  chrome?: BlockChrome;
  /**
   * The matched block type's ARIA identity (`BlockHandle.semantics`) — what the
   * line IS, applied to the leaf cell. Separate from `chrome` on purpose: chrome
   * is styling and sibling regions, and a role is neither.
   */
  semantics?: BlockSemantics;
  /** Everything a region is given — also the blob `boxClassName` reads. */
  region: BlockRegionProps;
  /**
   * The leading glyph when the type declares no `regions.start` — the handle's
   * marker ladder (toggle checkbox → `ordinalMarker` → static `marker`),
   * resolved by the calling surface since only it knows how to render one.
   */
  fallbackMarker?: ReactNode;
  /** The editable / rendered text leaf. */
  children: ReactNode;
}

/**
 * Renders one region, or nothing. A one-line helper so the
 * `react-hooks/static-components` exemption is stated once instead of four
 * times: the component is a registry LOOKUP into a module-eval'd `chrome`
 * object, exactly like `Anchor` in `block-row.tsx` / `read-only-blocks.tsx`.
 */
function Region({ of: Of, ...props }: BlockRegionProps & { of?: BlockRegion }) {
  // `Of` comes from the STATIC `BlockChrome.regions` object built at module eval inside the contribution literal, so its identity is a module constant and no state can reset.
  return Of ? <Of {...props} /> : null;
}

export function TextBlockLayout({
  chrome,
  semantics,
  region,
  fallbackMarker,
  children,
}: TextBlockLayoutProps) {
  const regions = chrome?.regions;
  const box =
    typeof chrome?.boxClassName === "function"
      ? chrome.boxClassName(region.data)
      : chrome?.boxClassName;
  // A declared `start` region REPLACES the handle's marker ladder.
  const marker = regions?.start ? (
    <Region of={regions.start} {...region} />
  ) : (
    fallbackMarker
  );

  return (
    // A — the padding box: decoration edge `C` → the block's own box.
    <Inset {...(chrome?.padding ?? {})}>
      {/* B — the box. A plain `div` with `cn(SURFACE_LEVELS[level], …)` rather
          than `<Surface level>`: the box renders unconditionally and the closed
          level set has no neutral member, so `<Surface>` could not be rendered
          always. The member-access form is the escape valve `no-adhoc-surface`
          names explicitly. Cost: no baked-in Ctrl+A select-scope, which the page
          editor's own selection model is better off without. */}
      <div
        className={cn(chrome?.surface && SURFACE_LEVELS[chrome.surface], box)}
      >
        <Region of={regions?.header} {...region} />
        {/* C — the line. */}
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- the fixed text-block skeleton (totality rule 1): this line/marker/leaf element chain is an ancestor of every LexicalComposer in the app, so it owns its raw flex mechanics rather than delegating them to a primitive whose internal element structure could change under it and remount every editor.
          className={cn(
            "relative flex gap-xs",
            chrome?.inset !== false && insetClass({ l: BLOCK_INSET }),
          )}
        >
          {/* Leading-marker gutter: a fixed-width column shared by every marker
              type so the text content edge is identical across block types.
              `justify-center` + `min-width` centers narrow glyphs (bullet,
              number, checkbox) and lets wider markers grow the column without
              disturbing the others. */}
          {marker != null ? (
            <div
              // eslint-disable-next-line layout/no-adhoc-layout -- see the line's note: fixed-skeleton mechanics, deliberately raw.
              className="flex flex-none select-none justify-center"
              style={{ minWidth: MARKER_GUTTER }}
            >
              {marker}
            </div>
          ) : null}
          {/* The LEAF cell. `relative` is what the editor's placeholder
              (`absolute left-0 top-0`) resolves against — `LexicalComposer`
              emits no DOM, so this stays the placeholder's positioned ancestor.

              It also CARRIES THE BLOCK'S ARIA IDENTITY, because it is the one
              skeleton element whose content is exactly the text: the marker
              gutter, all four regions, the rail and the row's `sr-only`
              "Selected." marker all sit outside it, so a name-from-content role
              (`heading`) is named by the line and nothing else. Attributes only
              — the element stays a `div` on every type and on both surfaces, so
              none of the three totality rules move. Do NOT put the role on the
              `<ContentEditable>` instead: that would drop Lexical's
              `role="textbox"` (the signal that this is editable) and the
              read-only surface has no ContentEditable to put it on. */}
          <div
            // eslint-disable-next-line layout/no-adhoc-layout -- see the line's note: fixed-skeleton mechanics, deliberately raw.
            className="relative min-w-0 flex-1"
            {...semanticsAttrs(semantics)}
          >
            {children}
          </div>
          <Region of={regions?.end} {...region} />
        </div>
        <Region of={regions?.footer} {...region} />
      </div>
    </Inset>
  );
}
