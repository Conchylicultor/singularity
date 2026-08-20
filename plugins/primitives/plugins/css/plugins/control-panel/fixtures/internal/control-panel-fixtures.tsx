import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import type { HarnessFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { ReactNode } from "react";
import { MdCallSplit, MdClose, MdSort, MdVisibility } from "react-icons/md";

// ── The control-panel geometry gate ─────────────────────────────────
//
// One region fixture plus one layout fixture per property the vocabulary exists
// to hold. They render the REAL components with real Tailwind in a real browser
// and measure boxes, so "every label starts at one x" stops being a review note
// and becomes a number the build compares.
//
// Every width everywhere: 262 / 320 / 524px — the `menu`, `picker` and `builder`
// width roles from `popover-width.ts`. A panel is only ever one of those three
// widths, so sweeping them is sweeping the whole real range rather than an
// invented one.
//
// ### How a fixture reaches inside the primitive
//
// The `data-geo` contract is an attribute the FIXTURE authors, and the panel
// primitives build their own cells — a row's icon cell, its label cell and the
// rule row's six tracks are internal spans with no prop to hang an attribute on.
// So each measured cell is marked from the inside, by a probe passed through the
// slot that lands in it:
//
//   - `<Fills>` — a `block w-full` box inside a cell. Because it fills the cell,
//     its left/right edges ARE the cell's, which is what makes "the label starts
//     at the text rail" measurable. Measuring the glyph or the text itself would
//     report a couple of centering pixels instead of the track.
//   - `<RailMarker>` — a zero-width box placed as LOOSE panel content, so it
//     sits wherever the panel's own inset puts it. It carries NO class: the
//     panel's content inset IS the rail, which is the property half these
//     fixtures exist to gate. Its edges therefore sit exactly on the rail, so
//     `leftPack(after: rail, gap: 0)` reads "this cell begins where the rail
//     says it does" — comparing two INDEPENDENT mechanisms: the `calc()` tokens
//     the panel's padding is built from versus the grid tracks the row is built
//     from. That is the whole of invariant #1, and it is the pair that can
//     actually drift.
//     There is only ONE marker kind now. v1 had two, because the panel's inset
//     was the TEXT rail and a section label hung back to the icon rail through a
//     `cp-rail-icon` class; the inset IS the icon rail today, that offset is
//     zero, and the class is gone.

/** A probe that fills its cell, so the measured box IS the cell's box. */
function Fills({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <span data-geo={id} className="block w-full truncate">
      {children}
    </span>
  );
}

/**
 * The truncating-text probe, for the fixture the falsification mutates. It
 * clamps with `max-w-full` rather than `w-full` — the same recipe `<Text>`'s
 * single-line leaf uses — so it still fills its cell while long, AND the
 * mutation's `max-width: none` can genuinely free it to its intrinsic width. A
 * hard `width: 100%` would survive the mutation and the falsification would
 * silently stop biting.
 */
function Leaf({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <span
      data-geo={id}
      className="inline-block max-w-full min-w-0 truncate align-middle"
    >
      {children}
    </span>
  );
}

/**
 * A zero-height, zero-width box sitting on the panel's rail, dropped in as
 * ordinary loose content. `w-0` keeps both its edges ON the rail — a plain block
 * would stretch and put the right edge at the panel's far side.
 *
 * It carries no class at all, and that IS the assertion: the panel's content
 * inset is the rail, so content that does nothing lands on it.
 */
function RailMarker({ id }: { id: string }) {
  return <span data-geo={id} className="block h-0 w-0" />;
}

/**
 * A zero-width probe placed FIRST inside a row's cell, so its edges are that
 * cell's left edge as the ROW GRID computes it — the grid tracks, not the
 * panel's padding. That independence is the point: an assertion comparing one
 * grid's cell against another's compares two genuinely different mechanisms.
 */
function RowRail({ id }: { id: string }) {
  return <span data-geo={id} className="inline-block h-0 w-0 align-middle" />;
}

/** The `menu` width role, in px — the width a control panel actually opens at. */
const MENU_ROLE_WIDTH = 262;
/** The `picker` width role, in px — a panel whose body is a grid. */
const PICKER_ROLE_WIDTH = 320;
/** The `builder` width role, in px. */
const BUILDER_ROLE_WIDTH = 524;

/** Every width role a `ControlPanelPopover` can open at — the whole real range. */
const WIDTHS = [MENU_ROLE_WIDTH, PICKER_ROLE_WIDTH, BUILDER_ROLE_WIDTH];

export const controlPanelFixtures: HarnessFixture[] = [
  // ── Invariant #1, gated by children the fixture cannot choose ─────
  //
  // The region fixture, and the reason the two fixtures below it are no longer
  // the last word. `mixed-content` was written after a raw `<Input>` shipped
  // ~50px left of every label around it, and it closed exactly that case — an
  // `<Input>` and a `<Button>`, both named here, both authored here. The next
  // child kind nobody thought of was just as unmeasured as the first.
  //
  // A `RegionFixture` hands the harness a HOLE instead: it says only "this box
  // opens a region", and `REGION_CHILDREN` decides what goes in it — a bare
  // input, a bare button, bare prose, a `display: contents`-wrapped
  // contribution, a `rail-follow` band, a `rail-bleed` row. Adding a member
  // there re-gates this panel with no edit here, which is what turns
  // "any new fixture must render something other than a Row" from a sentence
  // asking authors to remember into something they cannot get wrong.
  //
  // The children go inside a `Section` because that is how content actually
  // reaches a panel, and because the band is claimed to be inset-transparent:
  // `cp-panel` is the one box that pays, `cp-band` adds nothing, so a child
  // lands on the rail through it by doing nothing at all. Both halves of that
  // claim are under test here.
  //
  // Swept at every width ROLE (262 / 320 / 524) like everything else in this
  // file: a panel is only ever one of those widths, and `cp-panel`'s rail is an
  // asymmetric `calc()` pair (chrome pad + icon rail on the start, chrome pad +
  // row pad on the end) rather than a step off the ramp — so this is also the
  // fixture that proves a hand-built rail publishes what it actually applies.
  {
    kind: "region",
    id: "control-panel/region",
    primitive: "control-panel",
    widths: WIDTHS,
    render: (children) => (
      <ControlPanel aria-label="Region">
        <ControlPanel.Section label="Group by">{children}</ControlPanel.Section>
      </ControlPanel>
    ),
  },

  // ── Invariant #1: one rail ────────────────────────────────────────
  //
  // Measured across a MIXED row set on purpose. The 12/14/20/38px misalignment
  // this vocabulary replaces came from a flex row whose leading child was
  // conditional: a row with an icon indented its label, a row without one did
  // not, and a checkbox row indented it by a third amount. Grid tracks occupy
  // their width whether or not they are filled, so all five row kinds below must
  // report the SAME two left edges — and a regression to any leading-flex-child
  // construct moves at least one of them.
  {
    id: "control-panel/rail-alignment",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <ControlPanel aria-label="Rail alignment">
        <ControlPanel.Section
          label={<span data-geo="section-label">Group by</span>}
        >
          <RailMarker id="rail-icon" />
          <ControlPanel.Row
            icon={
              <Fills id="icon-row-cell">
                <MdVisibility />
              </Fills>
            }
          >
            {/* The text rail has no token to name it — it is an interior column
                of this grid — so the row publishes it: a zero-width probe first
                in the label cell. Every other row's label is then measured
                against a rail one of them actually computed. */}
            <RowRail id="rail-text" />
            <Fills id="icon-row-label">Visibility</Fills>
          </ControlPanel.Row>
          <ControlPanel.Row select="check" checked>
            <Fills id="check-row-label">Status</Fills>
          </ControlPanel.Row>
          <ControlPanel.Row select="switch" checked={false}>
            <Fills id="switch-row-label">Show all fields</Fills>
          </ControlPanel.Row>
          <ControlPanel.Row handle>
            <Fills id="handle-row-label">Priority</Fills>
          </ControlPanel.Row>
          <ControlPanel.Row>
            <Fills id="plain-row-label">Assignee</Fills>
          </ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>
    ),
    invariants: [
      // The rail: loose panel content, the section label and a row's icon cell
      // all begin at the same x. These are the two mechanisms that can drift —
      // the panel's own `calc(panel-pad + rail-icon)` padding versus the row
      // grid's gutter track plus its column gap. `gap: 0` because the marker's
      // right edge IS the rail.
      { kind: "leftPack", after: "rail-icon", slot: "section-label", gap: 0 },
      { kind: "leftPack", after: "rail-icon", slot: "icon-row-cell", gap: 0 },
      // The text rail: every row's LABEL begins at the same x, whatever the row
      // carries in front of it — an icon, a checkbox, a switch, a drag handle,
      // or nothing at all. This is invariant #1 as a user reads it.
      { kind: "leftPack", after: "rail-text", slot: "icon-row-label", gap: 0 },
      { kind: "leftPack", after: "rail-text", slot: "check-row-label", gap: 0 },
      {
        kind: "leftPack",
        after: "rail-text",
        slot: "switch-row-label",
        gap: 0,
      },
      {
        kind: "leftPack",
        after: "rail-text",
        slot: "handle-row-label",
        gap: 0,
      },
      { kind: "leftPack", after: "rail-text", slot: "plain-row-label", gap: 0 },
      { kind: "noClip" },
    ],
  },

  // ── Invariant #1, for content that is NOT a row ───────────────────
  //
  // The gap the other four fixtures could not see. They render Rows and
  // RuleRows exclusively, so the rail they measure is the row grid's own — and
  // every one of them passed while a raw `<Input>` dropped into a Section sat
  // flush against the panel's edge, ~50px left of the labels above and below
  // it. A panel is not a list of rows: `view-settings-popover` puts an Input and
  // a contributed `FieldRenderer` straight into a Section, and a `Setting`
  // contribution may put anything there.
  //
  // So the fixture measures LOOSE content — an `<Input>`, and a `<Button>` in a
  // second section — against the rail the ROW GRID computes, with no wrapper and
  // no opt-in anywhere in the fixture. That is the whole contract: the panel is
  // the one box that applies the content inset, so content that does nothing
  // lands on the rail, and only a Row (which cancels the inset to bleed its
  // hover fill full-width) has to do anything at all.
  //
  // The rail is the ICON rail. v1 measured loose content against a row's LABEL,
  // and that was the defect this fixture could not see: an interior column of the
  // row grid was handed to every search field and swatch grid in the app, which
  // indented them 26px past the section label above them. The comparison is now
  // loose content versus the row's leading CELL — and the panel here has no drag
  // handle in it, so that cell is also the first track the grid draws.
  {
    id: "control-panel/mixed-content",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <ControlPanel aria-label="Mixed content">
        <ControlPanel.Section
          label={<span data-geo="section-label">Name</span>}
        >
          <RailMarker id="rail-icon" />
          {/* A raw form control, exactly as a consumer drops one in. The
              measured box is the wrapper's, which fills the section, so its
              left edge IS where loose content lands. */}
          <Fills id="free-input">
            <Input defaultValue="My view" aria-label="View name" />
          </Fills>
          {/* The row whose leading cell defines the rail everything else is
              compared against — the grid's answer, not the panel's. */}
          <ControlPanel.Row
            icon={
              <Fills id="row-icon-cell">
                <MdVisibility />
              </Fills>
            }
          >
            Duplicate
          </ControlPanel.Row>
        </ControlPanel.Section>
        <ControlPanel.Section
          label={<span data-geo="options-label">Options</span>}
        >
          <Fills id="free-control">
            <Button variant="outline">Newest first</Button>
          </Fills>
        </ControlPanel.Section>
      </ControlPanel>
    ),
    invariants: [
      // THE assertion. Loose content begins exactly where a row's leading cell
      // begins — one rail, measured across two independent mechanisms (the
      // panel's content inset versus the row grid's tracks).
      { kind: "leftPack", after: "rail-icon", slot: "row-icon-cell", gap: 0 },
      { kind: "leftPack", after: "rail-icon", slot: "free-input", gap: 0 },
      // And it holds in a section that has no row of its own to copy from.
      { kind: "leftPack", after: "rail-icon", slot: "free-control", gap: 0 },
      // …and the section labels are on that same one edge, rather than hanging
      // back to a rail of their own.
      { kind: "leftPack", after: "rail-icon", slot: "section-label", gap: 0 },
      { kind: "leftPack", after: "rail-icon", slot: "options-label", gap: 0 },
      { kind: "noClip" },
    ],
  },

  // ── Invariant #5: width is a role, not a measurement ──────────────
  //
  // The panel is pinned at its `menu` role width inside a container that doubles
  // across the sweep, and every row box must measure the same at both. That is
  // the invariant the old panels broke in the other direction: their width was
  // whatever their widest row happened to need, so adding a rule resized the
  // popover.
  //
  // Two caveats, stated plainly rather than implied. The harness oracle compares
  // WIDTHS, so `rigidIntegrity` here pins the row's width, not its height —
  // invariant #2 ("one row height, in every panel") rests on `--cp-row-h` and the
  // unit test, because the oracle has no height invariant to express it with.
  // And it compares one slot to ITSELF across the sweep, not the five rows to
  // each other, so what this catches is a row that follows the space around the
  // panel — not one whose own content decided its box.
  {
    id: "control-panel/row-height",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <div style={{ width: MENU_ROLE_WIDTH }}>
        <ControlPanel aria-label="Row box">
          <ControlPanel.Section label="Properties">
            {/* The row itself takes no `data-geo`, so each row is wrapped in a
                marked box. A block wrapper is exactly as wide as the row it
                holds, so the measurement is the row's. */}
            <div data-geo="row-plain">
              <ControlPanel.Row>Assignee</ControlPanel.Row>
            </div>
            <div data-geo="row-icon">
              <ControlPanel.Row icon={<MdVisibility />}>
                Visibility
              </ControlPanel.Row>
            </div>
            <div data-geo="row-check">
              <ControlPanel.Row select="check" checked>
                Status
              </ControlPanel.Row>
            </div>
            <div data-geo="row-switch">
              <ControlPanel.Row select="switch" checked={false}>
                Show all fields
              </ControlPanel.Row>
            </div>
            <div data-geo="row-handle">
              <ControlPanel.Row handle>Priority</ControlPanel.Row>
            </div>
          </ControlPanel.Section>
        </ControlPanel>
      </div>
    ),
    invariants: [
      { kind: "rigidIntegrity", slot: "row-plain" },
      { kind: "rigidIntegrity", slot: "row-icon" },
      { kind: "rigidIntegrity", slot: "row-check" },
      { kind: "rigidIntegrity", slot: "row-switch" },
      { kind: "rigidIntegrity", slot: "row-handle" },
      { kind: "noClip" },
    ],
  },

  // ── The builder grid ──────────────────────────────────────────────
  //
  // The six-track rule row is what lets the filter builder and the sort builder
  // share one rail: both draw on `cp-rule`, so their field / operator / value
  // columns line up with each other and not merely each with itself. This
  // fixture pins the three properties that carry that promise — the cells never
  // collide, they have room at the builder width, the prefix column is rigid
  // (it is the column that was a hand-set `w-16` in the old filter panel), and
  // the trailing control is flush right instead of floating mid-row.
  {
    id: "control-panel/rule-grid",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <ControlPanel aria-label="Rule grid">
        <ControlPanel.Section label="Filter">
          <ControlPanel.RuleList>
            <div style={{ position: "relative" }}>
              {/* REAL content, not placeholders. A geometry gate fed "is" and
                  "Todo" measures a grid that has nothing to carry: the old
                  1.05/1/1.35 track ratios passed `neverTruncatesWhenRoomy` with
                  short strings while clipping "Sta…" and "Is no…" in the
                  deployed app. So each cell now holds what the filter builder
                  actually puts there — a field label with its leading type icon
                  and trailing chevron, a full operator phrase, and a
                  multi-select summary. */}
              <ControlPanel.RuleRow
                prefix={<Fills id="prefix">Where</Fills>}
                field={
                  <Fills id="field">
                    <ControlPanel.Field icon={<MdSort />} label="Status" />
                  </Fills>
                }
                operator={
                  <Fills id="operator">
                    <ControlPanel.Field label="Is none of" />
                  </Fills>
                }
                value={
                  <Fills id="value">
                    <ControlPanel.Field label="2 selected" />
                  </Fills>
                }
                // The trailing cell comes through `actions` rather than
                // `onRemove` for one reason: `RuleRow` builds the ✕ itself, so
                // there is no node the fixture could name. These are the same
                // two clusters the filter row builds — its "Turn into group"
                // action beside the remove — at the same total width, which is
                // the point: the filter is the TIGHTER of the two builders, with
                // ~26px less to share than sort. Gating on the roomier one would
                // let the case that actually clipped through.
                actions={
                  <span data-geo="remove" className="flex items-center gap-2xs">
                    <IconButton icon={MdCallSplit} label="Turn into group" />
                    <IconButton icon={MdClose} label="Remove" />
                  </span>
                }
              />
              {/* The measurement frame. `pinnedRight` compares against the
                  measured container, so the fixture authors one: an inert
                  overlay over the panel's CONTENT box — which is exactly where
                  a row's trailing cell ends, since the panel's content inset
                  and the row's inline padding are two sides of one
                  cancellation. Measuring against the panel's outer edge
                  instead would need an ε as wide as the inset, which would also
                  accept a remove cell that had drifted well off the edge.
                  `__measure` prefers the innermost `[data-geo="container"]`,
                  which is this one. */}
              <div
                data-geo="container"
                style={{ position: "absolute", inset: 0 }}
              />
            </div>
          </ControlPanel.RuleList>
        </ControlPanel.Section>
      </ControlPanel>
    ),
    invariants: [
      { kind: "noOverlap" },
      {
        kind: "neverTruncatesWhenRoomy",
        slots: ["prefix", "field", "operator", "value"],
      },
      // The prefix column is a declared track width (`--cp-prefix-col`), not the
      // width of whichever conjunction word happens to be showing. It stays put
      // as the panel widens; if it ever started sizing to content, the filter and
      // sort builders would stop lining up with each other.
      { kind: "rigidIntegrity", slot: "prefix" },
      { kind: "pinnedRight", slot: "remove" },
    ],
  },

  // ── The builder grid, two-cell shape ──────────────────────────────
  //
  // A builder with no operator (sort) is a SECOND, differently-proportioned
  // layout of the same primitive — `cp-rule` swaps its whole template under
  // `[data-span="field"]`. The fixture above measures only the three-cell shape,
  // so nothing measured this one, and a rebalance that fixed the filter shipped
  // a clipped sort: the old rule let the field cell absorb the freed operator
  // track (2fr / 1fr), leaving "Updated" in 252px while "Newest first" clipped
  // at 124px. One shape gated and one shape unmeasured is how a shared grid
  // drifts into two, which is the whole thing this vocabulary exists to stop.
  //
  // A separate fixture rather than a second row in the one above, for a
  // mechanical reason: `pinnedRight` measures against the innermost
  // `[data-geo="container"]`, and each rule row authors its own measurement
  // frame — two frames in one fixture would make which one it resolves against
  // ambiguous.
  //
  // Real content again, and the sort builder's own trailing width: ONE cluster
  // (24px) where the filter carries two (50px). That is a genuinely different
  // budget, not a detail.
  {
    id: "control-panel/rule-grid-two-cell",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <ControlPanel aria-label="Rule grid, two-cell">
        <ControlPanel.Section label="Sort">
          <ControlPanel.RuleList>
            <div style={{ position: "relative" }}>
              <ControlPanel.RuleRow
                prefix={<Fills id="prefix">Sort by</Fills>}
                field={
                  <Fills id="field">
                    <ControlPanel.Field icon={<MdSort />} label="Updated" />
                  </Fills>
                }
                // No `operator` — this IS the two-cell shape, and omitting it is
                // the only way to author it. `RuleRow` stamps `data-span="field"`
                // off exactly this absence.
                value={
                  <Fills id="value">
                    <ControlPanel.Field label="Newest first" />
                  </Fills>
                }
                actions={
                  <span data-geo="remove" className="flex items-center">
                    <IconButton icon={MdClose} label="Remove" />
                  </span>
                }
              />
              <div
                data-geo="container"
                style={{ position: "absolute", inset: 0 }}
              />
            </div>
          </ControlPanel.RuleList>
        </ControlPanel.Section>
      </ControlPanel>
    ),
    invariants: [
      { kind: "noOverlap" },
      // The assertion that would have caught the regression: with the field cell
      // absorbing the freed track, the value cell is the one that clips.
      {
        kind: "neverTruncatesWhenRoomy",
        slots: ["prefix", "field", "value"],
      },
      // The prefix track is the same declared width in BOTH shapes — it is what
      // puts the two builders' field cells on one rail.
      { kind: "rigidIntegrity", slot: "prefix" },
      { kind: "pinnedRight", slot: "remove" },
    ],
  },

  // ── The label is what gives up space, and the proof the gate bites ──
  //
  // Narrow the panel and something has to shrink. In a `cp-row` it is always the
  // LABEL: the label track is `minmax(0, 1fr)` and every track beside it is
  // rigid, so a long label shortens itself rather than pushing the trailing
  // control off the row.
  //
  // Measured as three facts that together say exactly that, at both widths:
  //
  //   - `rigidIntegrity` on the trailing box — it gave up nothing.
  //   - `noClip` — and nothing was pushed out of the panel either.
  //   - ⇒ the narrowing was absorbed by the label, and `noOverlap` says it was
  //     absorbed by truncating rather than by sliding under the trailing cell.
  //
  // NOT `truncationOnsetOrder(content, indicator)`, which is what this fixture
  // first tried: that invariant requires BOTH slots to enter the truncating state
  // somewhere in the sweep, and a `cp-row`'s trailing cell structurally never
  // does. Its track is `auto`, whose base size is the item's min-content
  // contribution — for a nowrap text that is the whole string, and `min-w-0` on a
  // descendant cannot lower it, because the grid item is the primitive's own
  // wrapper. The trailing cell being unshrinkable IS the invariant here, so the
  // assertion was unsatisfiable by construction, not merely mis-tuned.
  //
  // The falsification is the load-bearing half. It re-renders the same row as the
  // construct ui-kit's CLAUDE.md documents as the bug — the trailing control
  // pulled out of flow (`absolute right-2`) with its space merely HINTED by
  // right-padding on a flex row — and asserts `noOverlap` then fails. Reserved
  // padding is a hint the flexible label can ignore, and it does: the label slides
  // straight under the control. If that mutation ever stops failing, this whole
  // fixture is measuring nothing, and the suite says so out loud rather than going
  // quietly green.
  {
    id: "control-panel/long-label",
    primitive: "control-panel",
    dims: { contentLen: "long", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <ControlPanel aria-label="Long label">
        <ControlPanel.Section label="Sort">
          <ControlPanel.Row
            icon={<MdSort />}
            trailing={
              // A trailing cell as the contract describes it — a short count or
              // word. `nowrap` so its box is one deterministic measurement rather
              // than a wrapping paragraph.
              <span data-geo="indicator" className="whitespace-nowrap">
                Descending
              </span>
            }
          >
            <Leaf id="content">
              Last updated by the agent that opened this worktree
            </Leaf>
          </ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>
    ),
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      { kind: "rigidIntegrity", slot: "indicator" },
      { kind: "neverTruncatesWhenRoomy", slots: ["indicator"] },
      {
        kind: "falsification",
        mutate: { kind: "swapLeafDisplay", value: "absolute-pad" },
        expectViolated: { kind: "noOverlap" },
      },
    ],
  },

  // ── The leading tracks are derived from the panel's content ───────
  //
  // A track exists only when something in the PANEL occupies it. Nothing here
  // measures a width, because the point is not that a track is 16px — it is
  // that a panel with nothing to put in a column does not indent everything
  // past it. The two panels below are the two cases the rail-alignment fixture
  // (which has both a handle and icons) cannot reach.
  //
  // NOT a Row-only fixture, deliberately: the panel `CLAUDE.md` rule exists
  // because rows were the one child kind the gate ever drew, and the property
  // being gated here is precisely that NON-row content — a section label, a raw
  // `<Input>` — shares the rail with the row grid's first cell.
  {
    id: "control-panel/derived-tracks",
    primitive: "control-panel",
    dims: { contentLen: "short", withMeta: true, state: "idle" },
    widths: WIDTHS,
    render: () => (
      <>
        {/* Neither a drag handle nor an icon anywhere in this panel, so it has
            NEITHER leading track: a two-track row, a five-track rule, and every
            piece of content — the label, the input, the row's own text, the
            builder's prefix — flush on the panel's one content edge. Before the
            tracks were derived, all four sat 32px right of it, reserving a
            gutter and an icon column that nothing in the panel ever painted. */}
        <ControlPanel aria-label="Derived tracks, no leading columns">
          <ControlPanel.Section label={<span data-geo="bare-label">Name</span>}>
            <RailMarker id="bare-rail" />
            <Fills id="bare-input">
              <Input defaultValue="My view" aria-label="View name" />
            </Fills>
            <ControlPanel.Row>
              <Fills id="bare-row-label">Assignee</Fills>
            </ControlPanel.Row>
            <ControlPanel.RuleList>
              <ControlPanel.RuleRow
                prefix={<Fills id="bare-rule-prefix">Where</Fills>}
                field={<ControlPanel.Field label="Status" />}
                operator={<ControlPanel.Field label="Is" />}
                value={<ControlPanel.Field label="Todo" />}
              />
            </ControlPanel.RuleList>
          </ControlPanel.Section>
        </ControlPanel>
        {/* A handle, but still no icon: the gutter track stays and the icon
            column goes. The row's LABEL and the builder's PREFIX then both land
            on the icon rail — one column in from the panel's edge — which is
            the shared-rail property that makes a settings menu and a filter
            builder read as one family. Two different grids computing the same
            x, which is the pair that can actually drift. */}
        <ControlPanel aria-label="Derived tracks, gutter only">
          <ControlPanel.Section>
            <ControlPanel.Row handle>
              <RowRail id="gutter-row-rail" />
              Priority
            </ControlPanel.Row>
            <ControlPanel.RuleList>
              <ControlPanel.RuleRow
                handle
                prefix={
                  <span data-geo="gutter-rule-prefix" className="block w-0" />
                }
                field={<ControlPanel.Field label="Updated" />}
                value={<ControlPanel.Field label="Newest first" />}
              />
            </ControlPanel.RuleList>
          </ControlPanel.Section>
        </ControlPanel>
      </>
    ),
    invariants: [
      // Panel one: everything on one edge, whatever mechanism computed it —
      // the panel's padding (the marker), the section label, the row grid's
      // first track, the rule grid's first track.
      { kind: "leftPack", after: "bare-rail", slot: "bare-label", gap: 0 },
      { kind: "leftPack", after: "bare-rail", slot: "bare-input", gap: 0 },
      { kind: "leftPack", after: "bare-rail", slot: "bare-row-label", gap: 0 },
      {
        kind: "leftPack",
        after: "bare-rail",
        slot: "bare-rule-prefix",
        gap: 0,
      },
      // Panel two: with the gutter kept and the icon column dropped, the row's
      // label and the builder's prefix share one rail — `cp-row`'s
      // gutter + column-gap versus `cp-rule`'s compensated gutter + rule-gap.
      {
        kind: "leftPack",
        after: "gutter-row-rail",
        slot: "gutter-rule-prefix",
        gap: 0,
      },
      { kind: "noClip" },
    ],
  },
];
