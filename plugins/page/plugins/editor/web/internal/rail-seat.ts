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
   * How many PADDED container frames enclose this row, its own included when it
   * is that frame's anchor. The row reserves one `framePadX` of `padding-right`
   * per frame; each frame pulls its box's right edge in by one FEWER (its own
   * does not clear itself), and that difference of one IS the card's right
   * padding. `"rule"` containers are not counted at all — a quote's bar has no
   * right edge to clear, so a card nested in a quote is padded once, by itself.
   *
   * It rides here, on the seat, because it is the same fact `left` is: a row's
   * relationship to the frames spanning it, which only the resolver can see.
   */
  padFrames: number;
  /**
   * How many padded frames' TOP edge sits at this row's top — the row reserves
   * one `framePadY` of `padding-top` per frame, which is what MAKES a card's top
   * padding (a backdrop can only overlap the block above, never displace it).
   *
   * Zero for a container ANCHOR that has visible children: it is deliberately
   * zero-height, so its frame's pad is reserved by the first row that actually
   * renders a line. Nested cards all open on that same row, hence a count.
   */
  padFramesOpening: number;
  /** The same, for the frames whose BOTTOM edge sits at this row's bottom. */
  padFramesClosing: number;
  /**
   * How many enclosing frames have ABSORBED this row's indent step — reclaimed
   * the `BLOCK_INDENT` its content would have been pushed in by and spent it as
   * `FRAME_PAD_X` instead. What `blockContentLeft` takes as `absorbed`.
   *
   * A container ANCHOR does not count its OWN frame: the box is measured from
   * the anchor's content edge, so absorbing there would move the box rather than
   * its contents. And a frame with a gutter GLYPH absorbs nothing at all — see
   * `FRAME_PAD_X`, since the glyph stands in the column being reclaimed.
   */
  absorbedIndent: number;
  /**
   * Padded frames whose top pad lies ABOVE the line this row's gutter controls
   * seat on — what `--gutter-first-line-center` must add, or the rail's buttons
   * float in the card's padding instead of beside its first line.
   *
   * Equal to `padFramesOpening` for an ordinary row. For an ANCHOR it is the
   * opening count of the row it BORROWS its line from, since the anchor reserves
   * nothing itself and its own row's top is the box's top.
   */
  firstLinePad: number;
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
export function gutterFirstLineCenter(
  handle: BlockHandle<unknown> | undefined,
): string {
  return (
    handle?.gutterFirstLineCenter ??
    `calc(var(--space-xs) + ${DOC_LINE_HEIGHT[handle?.textVariant ?? "body"]} / 2)`
  );
}

/**
 * Resolve every flat row's rail seat in one walk.
 *
 * `spans` must be `computeFrameSpans`' output over the same `flat`, `handleOf`
 * the editor's registered-handle lookup, and `padsBox` / `absorbsIndent` the two
 * halves of `useFrameGeometry()` — the facts a row cannot see from itself.
 */
export function resolveRailSeats(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
  padsBox: (type: string) => boolean,
  absorbsIndent: (type: string) => boolean,
): RailSeat[] {
  const isAnchor = (i: number) =>
    handleOf(flat[i]!.block.type)?.anchor === true;
  // Every pad count reads the PADDED spans only, so a `"rule"` container is
  // invisible to the padding geometry rather than something each count has to
  // remember to skip.
  const padded = spans.filter((s) => padsBox(s.block.type));
  const padFrames = computeFrameCounts(flat, padded);
  const { opening, closing } = computeFramePadEdges(flat, padded, isAnchor);
  // Absorption is a strict subset of padding, and it moves CONTENT EDGES — so it
  // has to be resolved before the rail lefts, which are content edges.
  const absorbing = spans.filter((s) => absorbsIndent(s.block.type));
  const covering = computeFrameCounts(flat, absorbing);
  const absorbed = flat.map(
    (f, i) =>
      covering[i]! -
      // Its OWN frame absorbs from its children, never from the row the box is
      // measured from. Subtracting it here is what keeps a card's box on the
      // prose x while its contents move in.
      (isAnchor(i) && absorbsIndent(f.block.type) ? 1 : 0),
  );
  const lefts = computeRailLefts(flat, spans, absorbed);

  return flat.map((f, i) => {
    const self = { block: f.block, childCount: f.childCount };
    const chain = borrowChain(flat, i, isAnchor);
    return {
      left: lefts[i]!,
      absorbedIndent: absorbed[i]!,
      padFrames: padFrames[i]!,
      padFramesOpening: opening[i]!,
      padFramesClosing: closing[i]!,
      firstLinePad: opening[borrowedLineRow(flat, i, isAnchor)]!,
      // The OUTERMOST container whose borrowed line this row is (the chain is
      // ordered outermost-first), else the row itself. An anchor row has an
      // empty chain by construction — it renders no line, so no line of its own
      // can be borrowed from it, and it renders no rail either.
      owner: chain[0]
        ? { block: chain[0].block, childCount: chain[0].childCount }
        : self,
      borrowedFirstLineCenter: borrowedFirstLineCenter(
        flat,
        i,
        handleOf,
        isAnchor,
      ),
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
  absorbed: readonly number[],
): number[] {
  const out = flat.map((f, i) => blockContentLeft(f.depth, absorbed[i]!));
  const seated = new Array<boolean>(flat.length).fill(false);
  for (const span of spans) {
    // The frame's own content edge, which is the anchor row's — so it reads that
    // row's absorbed count, not the covered row's.
    const left = blockContentLeft(span.depth, absorbed[span.start]!);
    for (let i = span.start; i <= span.end; i += 1) {
      if (seated[i]) continue;
      seated[i] = true;
      out[i] = left;
    }
  }
  return out;
}

/**
 * How many of the given frames cover each flat index — the count the box's right
 * edge and the enclosed rows' `padding-right` both read (one apart), which is
 * what keeps a card's text inside its own tint however deeply the cards nest.
 *
 * Unlike `computeRailLefts` this ACCUMULATES rather than taking the outermost:
 * the left edge is a single seat (controls sit outside the outermost box), while
 * the pad is a stack (each box closes one step further in, mirroring the
 * `BLOCK_INDENT` its children opened it by).
 *
 * `spans` is the PADDED subset, not every frame — see `resolveRailSeats`.
 */
function computeFrameCounts(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
): number[] {
  const out = flat.map(() => 0);
  for (const span of spans) {
    for (let i = span.start; i <= span.end; i += 1) out[i] = out[i]! + 1;
  }
  return out;
}

/**
 * Which row's TOP each padded frame's pad is reserved on, and which row's BOTTOM
 * — as a count per flat index, since nested cards open and close together.
 *
 * A frame's top pad cannot be reserved on its own anchor row: that row is
 * deliberately ZERO HEIGHT while it has visible children (the decoration and the
 * first child share one line), and padding it would grow it. So the walk skips
 * the run of anchor rows a span opens with and lands on the first row that
 * actually renders something — which for a CHILDLESS container is its own row,
 * the one carrying the surface's one-empty-line fallback.
 *
 * The bottom is simply `span.end`: a span ends on a row that renders a line by
 * construction (an anchor's span always extends past it to its last descendant).
 */
function computeFramePadEdges(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  isAnchor: (i: number) => boolean,
): { opening: number[]; closing: number[] } {
  const opening = flat.map(() => 0);
  const closing = flat.map(() => 0);
  for (const span of spans) {
    const first = frameOpenRow(span, isAnchor);
    opening[first] = opening[first]! + 1;
    closing[span.end] = closing[span.end]! + 1;
  }
  return { opening, closing };
}

/**
 * The row a frame's box actually BEGINS on: its span's start, walked past the
 * run of zero-height anchor rows it opens with.
 *
 * ONE definition, read by the two things that must agree about it — which row
 * reserves a frame's top pad, and whether a frame shares that row with the
 * frames around it. They disagreed while this walk was written out twice, and
 * the symptom was a nested card with no top padding at all.
 */
function frameOpenRow(
  span: FrameSpan,
  isAnchor: (i: number) => boolean,
): number {
  let first = span.start;
  while (first < span.end && isAnchor(first)) first += 1;
  return first;
}

/**
 * How far ONE frame pulls its own box in, per side, in pads.
 *
 * The three sides do NOT share a count, and that is the whole content of this
 * type. The RIGHT inset is positional-independent — every row inside a frame
 * reserves `padding-right` for it, so "how many padded frames enclose me" is the
 * complete answer. The VERTICAL insets are not: a frame's pad is reserved on
 * ONE row (the row it opens on, and the row it closes on), so an enclosing
 * frame's pad sits above this box only when the two frames open on the SAME row.
 *
 * Using the horizontal count for all three is what left a card nested as a
 * later child of another card with zero top padding: its own row reserved one
 * pad, and its box then pulled down by one for the parent that had already
 * spent its pad rows earlier — the two cancelling exactly.
 */
export interface FramePadInsets {
  /** Padded frames enclosing this one. */
  right: number;
  /** …of those, the ones OPENING on the same row, whose pad sits above this box. */
  top: number;
  /** …and the ones CLOSING on the same row, whose pad sits below it. */
  bottom: number;
}

/**
 * Each frame's own box insets, keyed by the container block's id.
 *
 * Separate from `resolveRailSeats` because it answers a per-FRAME question where
 * that answers a per-ROW one, and it shares the two things they must agree on —
 * `frameOpenRow` and the padded-span filter — by calling them rather than by
 * restating them.
 */
export function resolveFramePadInsets(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
  padsBox: (type: string) => boolean,
): ReadonlyMap<string, FramePadInsets> {
  const isAnchor = (i: number) =>
    handleOf(flat[i]!.block.type)?.anchor === true;
  const padded = spans.filter((s) => padsBox(s.block.type));
  const covering = computeFrameCounts(flat, padded);
  const out = new Map<string, FramePadInsets>();

  for (const span of spans) {
    const openRow = frameOpenRow(span, isAnchor);
    let top = 0;
    let bottom = 0;
    for (const other of padded) {
      // Spans nest and never partially overlap, so containment is a plain
      // comparison; a span is never its own encloser.
      if (other.start === span.start) continue;
      if (other.start > span.start || other.end < span.end) continue;
      if (frameOpenRow(other, isAnchor) === openRow) top += 1;
      if (other.end === span.end) bottom += 1;
    }
    out.set(span.block.id, {
      // Its own frame does not clear itself, so it comes out of the count.
      right: covering[span.start]! - (padsBox(span.block.type) ? 1 : 0),
      top,
      bottom,
    });
  }
  return out;
}

/**
 * The row whose first LINE row `i`'s gutter controls seat on: the row itself,
 * or — for a container anchor, which renders no line — the first visible
 * descendant that does.
 *
 * Two things read it and must agree: which handle's `gutterFirstLineCenter` to
 * take, and whose top pad sits above that line. Splitting the walk in two is how
 * a card's glyph would end up centred on a line one pad away from where it is.
 */
function borrowedLineRow(
  flat: readonly FlatBlock[],
  i: number,
  isAnchor: (i: number) => boolean,
): number {
  let j = i;
  while (flat[j]!.firstVisibleChildType !== null && isAnchor(j)) j += 1;
  return j;
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
  isAnchor: (i: number) => boolean,
): string | undefined {
  if (!isAnchor(i)) return undefined;
  const j = borrowedLineRow(flat, i, isAnchor);
  return gutterFirstLineCenter(handleOf(flat[j]!.block.type));
}
