// ── Measured geometry (the oracle's input) ─────────────────────────
//
// `MeasuredBox` mirrors the load-bearing fields of `getBoundingClientRect`.
// `MeasuredFixture` is one width's measurement of a rendered fixture: the
// container box, every measured slot keyed by its `data-geo` id, and the DOM
// order of those slot ids (left → right). `truncates` is the standard
// `scrollWidth > clientWidth` "is this text ellipsized" signal.
//
// The three rail fields exist because the oracle cannot compute them: they are
// the published inline rail (`--rail-start` / `--rail-end`) and the box edge it
// is measured from. Both custom properties are RESOLVED TO PIXELS by laying them
// out, never by parsing the computed text — `--rail-start: var(--space-lg)`
// computes to the string `1rem`, so `parseFloat` would read `1`. `null` means
// the region published NOTHING, which `railAlignment` reports as a failure
// rather than silently treating as a 0px rail.

export type MeasuredBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export interface MeasuredFixture {
  container: MeasuredBox;
  slots: Record<
    string,
    {
      box: MeasuredBox;
      truncates: boolean;
      /**
       * Where this box's CONTENT starts: `rect.left + paddingLeft`. The rail is
       * about content edges, not border-box edges — a `rail-bleed` row's box
       * deliberately reaches back out to the region's edge and re-applies the
       * rail as its own padding, so only its content edge is on the rail. A box
       * that applies no padding of its own reports its plain left edge.
       */
      contentLeft: number;
      /**
       * Where this box's INK looks vertically centred — the y a reader's eye
       * calls "the middle of this thing", which is not the middle of its box.
       *
       * Text: the midpoint of the ink top and the baseline. A text box reserves
       * room below the baseline for descenders and half-leading, so its box
       * centre sits below the letters; the letters are what the eye lines up.
       * Measured from canvas `TextMetrics` (`actualBoundingBoxAscent` for the
       * ink top, `fontBoundingBox*` + the computed `line-height` for where the
       * baseline falls inside the box).
       *
       * An `<svg>`: the centre of `getBBox()` — the drawn ink — mapped through
       * the `viewBox` onto the rendered rect. A Material glyph does not fill its
       * viewBox, so the box centre would hide a real misalignment.
       *
       * `null` when the box bears neither: an empty spacer has no ink and
       * therefore no optical centre. Like `railStart`, `null` means NOT
       * MEASURABLE, and `opticalCenter` reports it as a failure rather than
       * silently counting a box with nothing in it as agreeing with everything.
       */
      opticalCenter: number | null;
    }
  >;
  order: string[];
  /**
   * The PUBLISHER's padding-box left edge — the x that `--rail-start` is
   * measured from. It is the padding box (`rect.left + borderLeftWidth`), not
   * the border box, because a region's border sits outside the rail: a bordered
   * `OverlayPanel` would otherwise read one pixel off at every width.
   */
  railOrigin: number;
  /** Published `--rail-start`, in px; `null` when no ancestor publishes one. */
  railStart: number | null;
  /** Published `--rail-end`, in px; `null` when no ancestor publishes one. */
  railEnd: number | null;
}
