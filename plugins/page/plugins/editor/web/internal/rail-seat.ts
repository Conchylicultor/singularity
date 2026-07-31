import { blockContentLeft } from "./page-column";
import type { Block, BlockHandle, BlockTextVariant } from "../../core";
import type { FlatBlock, FrameSpan } from "./block-frames";

/**
 * The gutter rail's ONE resolved seat per flat row: where its controls sit, and
 * — the load-bearing half — which block they act on.
 *
 * A void container (callout, context) renders no line of its own: it borrows its
 * first visible child's. Four affordances then share one visual line, and before
 * this module each one answered "whose line is this?" separately — the chevron
 * from an explicit owner, the `+`/drag/menu implicitly from the row's own block,
 * the geometry from the frame spans with the identity thrown away. Dragging the
 * rail handle on a callout's first line pulled that line OUT of the box.
 *
 * So there is one walk and one answer. Two rules meet on that line, and
 * **conflating them is the bug this module exists to kill** — they are stated
 * separately because they genuinely disagree, on purpose:
 *
 * - **`left` is a SPAN rule.** Every row inside a container's frame — the
 *   borrowed first line and lines 2..n alike — seats its controls at the
 *   FRAME's content edge, so they sit outside the box and leave the container's
 *   decoration column free. This is geometry only; it says nothing about who
 *   owns anything (`internal/page-column.ts` has the full derivation).
 * - **`owner` is a BORROW-CHAIN rule.** Only the borrowed *line* transfers
 *   ownership. Lines 2..n inside the box own themselves — they are the
 *   container's children, not its line, and their `+`/drag/menu must keep
 *   acting on them. The chain is the contiguous run of anchors immediately
 *   above the row, each one depth shallower; the OUTERMOST wins.
 *
 * A row inside a frame that is not the borrowed line therefore seats at the
 * frame's edge while owning itself. That pair is the whole distinction, and
 * `rail-seat.test.ts` asserts the two fields together for exactly that row.
 */
export interface RailSeat {
  /**
   * Content edge the controls hang back from (-20 / -40 / -60): this row's
   * OUTERMOST enclosing container FRAME's edge, or its own when unframed.
   * Geometry only — see the SPAN rule above.
   */
  left: number;
  /**
   * The block every rail control acts on: the outermost container whose
   * BORROWED LINE this row is, else the row's own block. Carries `childCount`
   * so a consumer can offer a fold without a second lookup.
   */
  owner: { block: Block; childCount: number };
  /**
   * Anchor rows only: the first-line centre the decoration borrows from the
   * first visible child, since an anchor has no line of its own to measure.
   */
  borrowedFirstLineCenter?: string;
  /**
   * The single chevron slot's target, or null. NOT simply `owner` — see
   * `resolveRailSeats`' allocation ladder for why it cannot be.
   */
  chevron: ChevronTarget | null;
}

/**
 * Which block a row's collapse chevron toggles, and the state it must show.
 * `blockId` is not always the row's own block: a container renders no line of its
 * own, so its chevron rides on the line it borrows.
 */
export interface ChevronTarget {
  blockId: string;
  collapsed: boolean;
}

// Per-variant text line-height, as a reference to the single-sourced `--doc-lh-*`
// var (defined in `components/block-document-scale.css`, imported by the row that
// renders it). Drives the DEFAULT gutter seat: a text block's first line sits at
// `py-xs + line-height/2`. A block that renders its first line elsewhere
// overrides the whole center via `handle.gutterFirstLineCenter` (callout,
// link-to-page, sub-page, divider, …).
const DOC_LINE_HEIGHT: Record<BlockTextVariant, string> = {
  title: "var(--doc-lh-title)",
  heading: "var(--doc-lh-heading)",
  subheading: "var(--doc-lh-subheading)",
  body: "var(--doc-lh-body)",
  label: "var(--doc-lh-label)",
  caption: "var(--doc-lh-caption)",
};

/**
 * Where a block's gutter controls seat vertically: a CSS length from the row's
 * top edge to the CENTER of its first rendered line. A block may override the
 * whole center (its first line isn't a plain text line); otherwise it is the
 * standard text seat, `py-xs + variant-line-height/2`.
 *
 * It lives beside the seat resolver rather than in `BlockRow` because a
 * container ANCHOR has no line of its own and must BORROW its first visible
 * child's — `resolveRailSeats` reads the child's handle through this same
 * function, so the row's own seat and the borrowed one cannot drift.
 */
export function gutterFirstLineCenter(handle: BlockHandle<unknown> | undefined): string {
  return (
    handle?.gutterFirstLineCenter ??
    `calc(var(--space-xs) + ${DOC_LINE_HEIGHT[handle?.textVariant ?? "body"]} / 2)`
  );
}

/**
 * Resolve every flat row's rail seat in one walk.
 *
 * `spans` must be `computeFrameSpans`' output over the same `flat`, and
 * `handleOf` the editor's registered-handle lookup — the two facts a row cannot
 * see from itself.
 */
export function resolveRailSeats(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
): RailSeat[] {
  const lefts = computeRailLefts(flat, spans);
  const isAnchor = (i: number) => handleOf(flat[i]!.block.type)?.anchor === true;

  return flat.map((f, i) => {
    const self = { block: f.block, childCount: f.childCount };
    const chain = borrowChain(flat, i, isAnchor);
    return {
      left: lefts[i]!,
      // The OUTERMOST container whose borrowed line this row is (the chain is
      // ordered outermost-first), else the row itself. An anchor row has an
      // empty chain by construction — it renders no line, so no line of its own
      // can be borrowed from it, and it renders no rail either.
      owner: chain[0] ? { block: chain[0].block, childCount: chain[0].childCount } : self,
      borrowedFirstLineCenter: borrowedFirstLineCenter(flat, i, handleOf),
      chevron: resolveChevron(f, chain, isAnchor(i), handleOf),
    };
  });
}

/**
 * The containers whose borrowed line row `i` is: the contiguous run of anchors
 * immediately above it, each one depth shallower, OUTERMOST first.
 *
 * The flatten is depth-first and an anchor always emits its first visible child
 * next, so that run IS the borrow chain — the depth step is what breaks it at
 * the first row that is merely a following sibling rather than a first child.
 *
 * An ANCHOR row's chain is empty: an anchor renders no line, so it is never
 * anybody's borrowed line, and it hosts no rail to hand over.
 */
function borrowChain(
  flat: readonly FlatBlock[],
  i: number,
  isAnchor: (i: number) => boolean,
): FlatBlock[] {
  if (isAnchor(i)) return [];
  const chain: FlatBlock[] = [];
  for (let j = i - 1; j >= 0; j--) {
    if (!isAnchor(j) || flat[j]!.depth !== flat[j + 1]!.depth - 1) break;
    chain.unshift(flat[j]!);
  }
  return chain;
}

/**
 * Which block this row's chevron toggles, and the state it must show.
 *
 * There is exactly ONE chevron slot on a borrowed line and it cannot be shared:
 * the SPAN rule seats a container and its whole subtree at the same `left`, so
 * the container's slot and its first child's are the same 20px box at the same
 * x and y — and two `z-raised` buttons there would leave the earlier one (the
 * container's) hit-tested under the later row.
 *
 * The container also cannot keep the chevron on its OWN row: gutter controls are
 * `pointer-events-none` until the row is hovered, and an anchor row is
 * zero-height by design, so nothing could ever reveal it. Collapse would be
 * unreachable while expanded. Hence: the borrowed line's row renders it, the
 * container owns it.
 *
 * **This is the one control that is NOT unconditionally the seat's `owner`**,
 * and the exception is a reachability rule, not an oversight: `/callout` WRAPS
 * the current block, so a callout's first child can be a collapsed toggle (or
 * any block with collapsed children) in one keystroke. A container that always
 * claimed the only slot would leave that child's content hidden behind nothing —
 * exactly the failure "a collapsed container always paints a line, and that line
 * always carries the way back out" was introduced to eliminate. The container
 * has a popover fallback; the line's own block has none.
 *
 * Ownership, in order — the first rule that fires wins:
 *
 * 1. **A COLLAPSED container claims it, outermost first.** This is what makes the
 *    fold reversible from the surface alone: a collapsed container always paints
 *    its borrowed line, and that line always carries a pinned chevron back out.
 *    It also keeps the control honest — the row's own block may be `expanded`
 *    with children while the box hides them, and a chevron rendered open over
 *    hidden content is a control that lies.
 * 2. **Otherwise the row's own block keeps it** whenever it needs one (the
 *    reachability rule above). Load-bearing for `collapsible: "always"` types,
 *    where the chevron is not a fold at all: a `sub-page`/`page-link` chevron
 *    drives the composite-union MOUNT, and taking it would remove the only way
 *    to expand a nested page inline.
 * 3. **Otherwise an expanded container with something to fold claims it**,
 *    outermost first. "Something to fold" is 2+ children: with exactly one, the
 *    container's fold and its child's are the same set of hidden lines, so the
 *    container's chevron would be redundant.
 *
 * Known limitation, deliberate: nested containers share one borrowed line, so
 * only the outermost claims a chevron. The inner one folds from the rail
 * popover's own Collapse item.
 */
function resolveChevron(
  f: FlatBlock,
  chain: readonly FlatBlock[],
  rowIsAnchor: boolean,
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
): ChevronTarget | null {
  // An anchor renders no line, so it never hosts a chevron of its own.
  if (rowIsAnchor) return null;

  const collapsed = chain.find((c) => !c.block.expanded);
  if (collapsed) return { blockId: collapsed.block.id, collapsed: true };

  const handle = handleOf(f.block.type);
  const ownShows = f.childCount > 0 || handle?.collapsible === "always";
  if (ownShows) return { blockId: f.block.id, collapsed: !f.block.expanded };

  const foldable = chain.find((c) => c.childCount > 1);
  return foldable ? { blockId: foldable.block.id, collapsed: false } : null;
}

/**
 * Each flat index's rail LEFT — the SPAN rule. For an unframed row that is its
 * own content edge; for a row inside one or more container frames it is the
 * OUTERMOST one's, so the controls sit outside the box and leave the container's
 * own decoration column free. See `internal/page-column.ts` for why that is
 * forced rather than preferred.
 *
 * `computeFrameSpans` walks the flatten in order, so an enclosing frame (which
 * necessarily starts at a lower index) is always emitted BEFORE the frames it
 * contains: the first span covering an index is its outermost one.
 */
function computeRailLefts(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
): number[] {
  const out = flat.map((f) => blockContentLeft(f.depth));
  const seated = new Array<boolean>(flat.length).fill(false);
  for (const span of spans) {
    const left = blockContentLeft(span.depth);
    for (let i = span.start; i <= span.end; i += 1) {
      if (seated[i]) continue;
      seated[i] = true;
      out[i] = left;
    }
  }
  return out;
}

/**
 * A container ANCHOR's BORROWED first-line center. The anchor renders no line of
 * its own, so `--gutter-first-line-center` — derived from a row's own handle —
 * is structurally unknowable for it; hardcoding the body center puts the glyph
 * ~6px high against an H1 child and tens of px off against a divider/image child
 * that declares its own center, and the error grows with the density preset.
 *
 * The flatten is depth-first, so an anchor's first visible child is ALWAYS the
 * immediately-following entry — walk forward through nested anchors to the first
 * row that actually renders a line, and read that handle's seat. An anchor with
 * no visible children terminates the walk on itself and takes its own (default)
 * seat, which is exactly the one-line fallback box it renders.
 *
 * `undefined` for every ordinary row, which reads its own handle instead.
 */
function borrowedFirstLineCenter(
  flat: readonly FlatBlock[],
  i: number,
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
): string | undefined {
  if (handleOf(flat[i]!.block.type)?.anchor !== true) return undefined;
  let j = i;
  while (
    flat[j]!.firstVisibleChildType !== null &&
    handleOf(flat[j]!.block.type)?.anchor === true
  ) {
    j += 1;
  }
  return gutterFirstLineCenter(handleOf(flat[j]!.block.type));
}
