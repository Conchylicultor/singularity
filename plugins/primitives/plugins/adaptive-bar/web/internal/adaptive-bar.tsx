import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { MdMoreHoriz } from "react-icons/md";
import {
  assign,
  describeEvidence,
  dropItem,
  emptyWidthCache,
  estimate,
  inlineWidthsFor,
  isShifted,
  overflowPx,
  passBudget,
  premiseShift,
  pushRound,
  recordMoves,
  staleOthers,
  summarizeRounds,
  write,
  type FitItem,
  type MovedWidth,
  type Round,
  type RoundItem,
  type Span,
  type WidthCache,
} from "@plugins/primitives/plugins/adaptive-bar/core";
import {
  formatLineageNode,
  formatLineagePath,
} from "@plugins/primitives/plugins/ui-context/core";
import { collectLineage } from "@plugins/primitives/plugins/ui-context/web";
import type {
  ActionForm,
  ShrinkLadder,
} from "@plugins/primitives/plugins/action-presentation/web";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Stack,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useResizeObserver } from "@plugins/primitives/plugins/element-size/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useEditMode } from "@plugins/primitives/plugins/edit-mode-signal/web";
import { AdaptiveBarItem } from "./bar-item";
import {
  failLoudly,
  reportFault,
  HARD_ROUND_CEILING,
  HYSTERESIS_PX,
  MAX_PREMISE_SHIFTS,
  MAX_SURRENDERS,
  TRACE_ROUNDS,
  WIDTH_EPSILON_PX,
} from "./diagnostics";
import { DEFAULT_LADDER, formFor, inlineRungsOf, yieldRankOf } from "./ladder";
import { readColumnGap, useLayoutMeasured, useMeasureWidth } from "./measure";
import { OverflowPanel } from "./overflow-panel";
import {
  BarFormsContext,
  BarRegistryContext,
  type BarItemEntry,
  type BarRegistry,
} from "./registry";
import {
  dockGroup,
  dockInline,
  holdsIframe,
  supportsStatePreservingMove,
} from "./relocate";

/** What happens to an occupant the row cannot fit. */
export type AdaptiveBarOverflow =
  /** Relocate it into the always-mounted panel behind a `⋯` trigger. */
  | "panel"
  /** Keep everything in the row and let the row scroll horizontally. */
  | "scroll"
  /** Drop it. Only legitimate when the host has a SECOND route to the content. */
  | "clip";

/** Which end of its own slack the row's occupants sit against. */
export type AdaptiveBarAlign = "start" | "end";

export interface AdaptiveBarProps {
  /** Gap between occupants, from the closed density ramp. Default `"xs"`. */
  gap?: SpaceStep;
  /** Accessible name of the `⋯` trigger and its panel. Default `"More"`. */
  label?: string;
  /** Default `"panel"`. */
  overflow?: AdaptiveBarOverflow;
  /**
   * Where the occupants sit inside the bar. Default `"start"`; `"end"` packs
   * them against the far edge — a trailing action cluster with the row's slack
   * in front of it, which is what a pane/toolbar header wants.
   *
   * A prop rather than a `className`, because the bar taking ALL the slack is
   * its one contract: a consumer cannot answer "where in the slack" with a
   * competing `Fill` sibling, so the bar has to answer it.
   */
  align?: AdaptiveBarAlign;
  children: ReactNode;
  className?: string;
}

/**
 * The bar DEFINES itself as the grow cell of its row, and that is a contract,
 * not a style choice: `barRoot.getBoundingClientRect().width` IS the available
 * width, with no ancestor-walking, no mutate-reflow-restore, and no forced
 * recalculation per sibling. A primitive that took a content-sized container
 * would have to go looking for the width; this one is handed it by the layout
 * engine.
 *
 * Kept as a module const rather than an inline literal: the `no-adhoc-*` rules
 * harvest string literals reached from a `className` — so, exactly like
 * `viewport-overlay`'s `OVERLAY_ROOT`, the primitive that OWNS these mechanics
 * does not have to disable the rule that keeps them out of feature code.
 */
const BAR_ROOT = "min-w-0 flex-1 whitespace-nowrap";
/** `panel`/`clip`: what does not fit leaves the row, and the row never spills. */
const BAR_CLIP = "overflow-hidden";
/** `scroll`: nothing leaves the row; the row itself scrolls. */
const BAR_SCROLL = "overflow-x-auto";
/**
 * The collapsed bucket is the OPPOSITE of a grow cell: it is one `⋯` sitting
 * among the row's other occupants, so taking the slack would starve the very
 * items it sits beside. It also measures nothing, so it has no use for the width
 * it would be taking.
 */
const BAR_COLLAPSED_ROOT = "shrink-0";
/** `align="end"`: the occupants pack against the far edge of the bar's slack. */
const BAR_ALIGN_END = "justify-end";

/**
 * A bar whose occupants shrink and relocate instead of being transformed or
 * dropped.
 *
 * ```tsx
 * <AdaptiveBar gap="xs" label="More actions">
 *   <SomeSlot.Render>
 *     {(item) => <AdaptiveBar.Item id={item.id}><Item {...item} /></AdaptiveBar.Item>}
 *   </SomeSlot.Render>
 * </AdaptiveBar>
 * ```
 *
 * The host names no contributor, declares no priority, hardcodes no width, and
 * renders no second copy of anything. Every policy comes from the widgets
 * themselves through `useActionForm`, because a bar's occupants come from
 * different plugins and it can name none of them.
 */
export function AdaptiveBar({
  gap = "xs",
  label = "More",
  overflow = "panel",
  align = "start",
  children,
  className,
}: AdaptiveBarProps): ReactElement {
  return (
    <AdaptiveBarShell
      gap={gap}
      label={label}
      overflow={overflow}
      align={align}
      className={className}
      collapsed={false}
    >
      {children}
    </AdaptiveBarShell>
  );
}

export interface AdaptiveBarCollapsedProps {
  /** Accessible name of the trigger and its panel. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The authored bucket: every occupant relocates, unconditionally, and nothing
 * is ever measured.
 *
 * For a slot whose layout config says "these live behind a `⋯`" — membership is
 * a decision the author already made, so width has no say in it. It is the same
 * item hosts and the same always-mounted panel as {@link AdaptiveBar}, minus the
 * fit math, which is why a rich widget parked here is still the same live
 * instance rather than a re-rendered menu row.
 */
export function AdaptiveBarCollapsed({
  label,
  children,
  className,
}: AdaptiveBarCollapsedProps): ReactElement {
  return (
    <AdaptiveBarShell
      gap="xs"
      label={label}
      overflow="panel"
      // The collapsed bucket is one `⋯` sitting among its row's other
      // occupants, so it holds no slack to align anything against.
      align="start"
      className={className}
      collapsed
    >
      {children}
    </AdaptiveBarShell>
  );
}

AdaptiveBar.Item = AdaptiveBarItem;
AdaptiveBar.Collapsed = AdaptiveBarCollapsed;

/** id → rung index, or `null` for "left the row". */
type Placement = ReadonlyMap<string, number | null>;

/**
 * The three refs that together mean "this bar has stopped deciding": whether it
 * has, the width it stopped at, and how many times it has done so.
 *
 * Bundled so {@link commitFloor} takes all of them or none. Flooring and
 * stopping are one act — a caller able to do half of it is the render loop that
 * killed the Layout Lab pane.
 *
 * Distinct from `degraded`, and the two must not be merged. `degraded` answers
 * "my width reading is a lie", so its remedy is the CEILING and it latches for
 * good. This one answers "my width is fine and my own search disagrees with the
 * engine at this width", so its remedy is the floor and it re-arms on a resize.
 */
interface Surrender {
  surrendered: { current: boolean };
  at: { current: number | null };
  count: { current: number };
}

/**
 * One search: everything scoped to "this row, this question, until the answer
 * stops moving".
 *
 * Bundled for the same reason {@link Surrender} is — a caller able to reset half
 * of it would file a fault describing a different episode, or reset the counter
 * that is the termination guarantee. {@link startEpisode} takes all of it or
 * none.
 *
 * The two counters are deliberately different, and merging them would give back
 * one of the two bugs this exists to fix:
 *
 * - `rounds` is **rounds of the same question**. A round that follows a resize,
 *   a contribution mounting or an occupant resizing itself is a new question,
 *   and answering it differently is not evidence that the search fails to
 *   settle. It resets whenever the premise moves. That is the fix.
 * - `total` is **rounds since the last settled answer**, and NOTHING resets it
 *   short of settling. It is the termination guarantee: `reconcile` re-enters
 *   itself synchronously after every commit, so an occupant that resizes itself
 *   on each of those commits would reset `rounds` forever and take the pane down
 *   with React's nested-update limit. See {@link HARD_ROUND_CEILING}.
 */
interface Episode {
  rounds: number;
  total: number;
  /** How many times the premise moved without the search ever settling. */
  shifts: number;
  /** What the previous round decided from. */
  premise: Round | null;
  /** The last few rounds, kept for whatever fault ends the episode. */
  trace: Round[];
  /** Occupants that moved under the search, collapsed per (id, rung). */
  moved: Map<string, MovedWidth>;
  /**
   * The best answer the search actually produced: the widest placement it
   * blessed as fitting, from measurements rather than estimates, at the width
   * recorded beside it.
   *
   * A search that runs out of rounds has usually produced perfectly good
   * answers along the way. Throwing all of them away and taking the floor is
   * what makes a transient fault cost the user their whole toolbar.
   */
  best: { placement: Placement; available: number } | null;
}

function newEpisode(): Episode {
  return {
    rounds: 0,
    total: 0,
    shifts: 0,
    premise: null,
    trace: [],
    moved: new Map(),
    best: null,
  };
}

const EMPTY_PLACEMENT: Placement = new Map();

/**
 * Where an occupant currently sits.
 *
 * Two different absences meet here and must not be confused: **not in the map
 * at all** is an item that has never been placed (or rendered nothing), and it
 * starts at its widest rung inline; a stored **`null`** is an item the fit
 * deliberately took out of the row. Reaching for `?? 0` collapses them — `null
 * ?? 0` is `0` — which silently puts every evicted occupant straight back in
 * the row, and the bar then looks like it simply never overflows.
 */
function rungOf(placement: Placement, id: string): number | null {
  return placement.has(id) ? (placement.get(id) ?? null) : 0;
}

function AdaptiveBarShell({
  gap,
  label,
  overflow,
  align,
  collapsed,
  className,
  children,
}: {
  gap: SpaceStep;
  label: string;
  overflow: AdaptiveBarOverflow;
  align: AdaptiveBarAlign;
  collapsed: boolean;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const measure = useMeasureWidth();
  const layoutMeasured = useLayoutMeasured();
  const editMode = useEditMode();

  // Nodes are tracked as STATE via callback refs, not as refs read during
  // render: the reconcile pass must re-run when one attaches, and a ref would
  // give it no way to know.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [panelDock, setPanelDock] = useState<HTMLElement | null>(null);
  const [parkingDock, setParkingDock] = useState<HTMLElement | null>(null);

  const [placement, setPlacement] = useState<Placement>(EMPTY_PLACEMENT);
  const [panelOpen, setPanelOpen] = useState(false);

  /**
   * The bar has stopped believing its own width, and renders every occupant
   * inline forever.
   *
   * Reached only from a fault, and it is the honest floor for one: when the
   * width reading is a lie, "everything in the row, clipped by CSS" is the one
   * configuration that hides nothing and cannot be argued with. The narrow
   * floor (`commitFloor`) is the opposite — it takes occupants OUT of the row,
   * which is exactly the outcome a bad width reading was already producing.
   *
   * Latching matters as much as the layout: without it the recovery re-measures,
   * re-decides, re-evicts, and oscillates forever against a host that cannot
   * give it a straight answer.
   */
  const [degraded, setDegraded] = useState(false);
  /**
   * What the rest of the component reads. `EMPTY_PLACEMENT` has no entry for
   * anyone, and `rungOf` reads a missing entry as rung 0 — so "degraded" IS
   * "everyone inline at their widest", with no second code path to keep in step.
   */
  const effective = degraded ? EMPTY_PLACEMENT : placement;

  // Everything the next decision reads but nobody renders. Bumping `version` is
  // how a change here asks for a pass; the entries themselves never live in
  // React state, so a pointer-down that changes nothing on screen re-renders
  // nothing.
  const entriesRef = useRef(new Map<string, BarItemEntry>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  /**
   * The declared ladders, mirrored into React state.
   *
   * The rest of an entry (container, holds, popup, pointer lock) stays in the
   * ref: it is decision input, not something anyone renders. A ladder is
   * different — it is what turns a rung into a FORM, and the form has to reach
   * the widget through a render. Deriving it by reading the ref during render
   * would also be a lie about reactivity: the ref can change without React
   * knowing, so the derived map would silently go stale.
   */
  const [ladders, setLadders] = useState<
    ReadonlyMap<string, Required<ShrinkLadder>>
  >(() => new Map());
  const putLadder = useCallback(
    (id: string, ladder: Required<ShrinkLadder> | null): void => {
      setLadders((prev) => {
        if (ladder === null) {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }
        if (prev.get(id) === ladder) return prev;
        const next = new Map(prev);
        next.set(id, ladder);
        return next;
      });
    },
    [],
  );

  const cacheRef = useRef<WidthCache>(emptyWidthCache);
  /** H2: rungs a committed promotion measured as not fitting, barred until the row is wider. */
  const blockedRef = useRef(
    new Map<string, { rung: number; atWidth: number }>(),
  );
  /** Rungs we promoted INTO on the last committed pass — H2's evidence. */
  const promotedRef = useRef(new Map<string, number>());
  const episodeRef = useRef<Episode>(newEpisode());
  const triggerWidthRef = useRef<number | null>(null);
  /** The slack probe costs a forced reflow, so it runs once per bar. */
  const slackCheckedRef = useRef(false);
  /**
   * This bar has stopped deciding, and the width it stopped at. See
   * {@link commitFloor}: a fault-forced floor is the last placement computed
   * for THIS width, and the bar re-arms only when the row genuinely resizes.
   */
  const surrenderedRef = useRef(false);
  const surrenderedAtRef = useRef<number | null>(null);
  const surrenderCountRef = useRef(0);
  const surrender = useMemo<Surrender>(
    () => ({
      surrendered: surrenderedRef,
      at: surrenderedAtRef,
      count: surrenderCountRef,
    }),
    [],
  );

  const registry = useMemo<BarRegistry>(
    () => ({
      editMode,
      register(id, container) {
        const entry: BarItemEntry = {
          id,
          container,
          ladder: entriesRef.current.get(id)?.ladder ?? DEFAULT_LADDER,
          holds: 0,
          popupOpen: false,
          pointerPinned: false,
          immovable: false,
        };
        entriesRef.current.set(id, entry);
        putLadder(id, entry.ladder);
        bump();
        return () => {
          if (entriesRef.current.get(id) === entry)
            entriesRef.current.delete(id);
          // The item left for good, so its measurements are not an estimate of
          // anything — unlike a rung the item merely is not sitting at, which is
          // deliberately kept.
          cacheRef.current = dropItem(cacheRef.current, id);
          blockedRef.current.delete(id);
          promotedRef.current.delete(id);
          putLadder(id, null);
          bump();
        };
      },
      declare(id, ladder) {
        const entry = entriesRef.current.get(id);
        if (entry === undefined) return () => {};
        entry.ladder = ladder;
        // A ladder change can change the rung count, which changes what the
        // cached widths mean — but only the widths for rungs that still exist
        // survive, and `inlineWidthsFor` reads exactly that many.
        putLadder(id, ladder);
        bump();
        return () => {
          const live = entriesRef.current.get(id);
          if (live !== entry) return;
          live.ladder = DEFAULT_LADDER;
          putLadder(id, DEFAULT_LADDER);
          bump();
        };
      },
      hold(id) {
        const entry = entriesRef.current.get(id);
        if (entry === undefined) return () => {};
        entry.holds += 1;
        // NO bump: a freeze changes nothing about the current layout. The
        // RELEASE bumps, which is what makes "deferred forever" unrepresentable.
        return () => {
          entry.holds -= 1;
          bump();
        };
      },
      setPopupOpen(id, open) {
        const entry = entriesRef.current.get(id);
        if (entry === undefined || entry.popupOpen === open) return;
        entry.popupOpen = open;
        // Same asymmetry as `hold`: opening freezes and changes nothing on
        // screen; closing is what releases a stored target.
        if (!open) bump();
      },
      contentChanged(id) {
        const entry = entriesRef.current.get(id);
        if (entry === undefined) return;
        // `hidden` is where the last pass recorded absence, so this compares
        // the new truth against the committed one and stays quiet otherwise —
        // a widget re-rendering its own internals must not cost a fit pass.
        const absent = entry.container.childElementCount === 0;
        if (absent !== (entry.container.hidden === true)) bump();
      },
    }),
    [editMode, bump, putLadder],
  );

  /**
   * The form each occupant renders at. Derived, never stored: the placement is
   * the state, and a second stored copy of the same fact is a second thing that
   * can be stale.
   */
  const forms = useMemo<ReadonlyMap<string, ActionForm>>(() => {
    const map = new Map<string, ActionForm>();
    for (const [id, ladder] of ladders) {
      map.set(id, formFor(ladder, collapsed ? null : rungOf(effective, id)));
    }
    return map;
  }, [ladders, effective, collapsed]);

  // An `⋯` with nothing behind it is dead chrome, so the trigger follows the
  // placement rather than the item count — including in the collapsed bucket,
  // where a contribution that rendered nothing is absent from the placement for
  // exactly this reason.
  const evictedCount = useMemo(() => {
    let n = 0;
    for (const rung of effective.values()) if (rung === null) n += 1;
    return n;
  }, [effective]);

  const showTrigger = overflow === "panel" && evictedCount > 0;

  /**
   * One pass: apply the committed placement to the DOM, measure what is now
   * inline, and decide the next placement.
   *
   * Split that way because a rung is React state — a widget only renders its
   * compact form after a commit — so a pass cannot both decide and observe the
   * consequence. Docking, by contrast, is pure DOM and happens here, following
   * the placement React has already committed. The loop terminates by the
   * placement repeating, not by a fixed number of rounds; the round budget is
   * the assertion that it does.
   */
  const reconcile = useCallback((): void => {
    if (root === null) return;
    const entries = entriesRef.current;

    // ── Order, straight from the DOM ──────────────────────────────────────
    // Document order of the anchors IS the order the host produced, reorder
    // middleware and all. Nothing else can be trusted: mount order gets a
    // mid-list insertion wrong, and a consumer-declared order is a second
    // source of truth for something the DOM already knows.
    const anchors = [
      ...root.querySelectorAll<HTMLElement>("[data-adaptive-bar-anchor]"),
    ];
    const order: { id: string; anchor: HTMLElement; entry: BarItemEntry }[] =
      [];
    for (const anchor of anchors) {
      const id = anchor.getAttribute("data-adaptive-bar-anchor");
      const entry = id === null ? undefined : entries.get(id);
      if (id !== null && entry !== undefined) order.push({ id, anchor, entry });
    }

    // ── 1. Apply the committed placement ──────────────────────────────────
    const evicted: string[] = [];
    for (const { id, anchor, entry } of order) {
      const absent = entry.container.childElementCount === 0;
      // An absent occupant contributes no width AND NO GAP. A 0×0 flex item
      // would still be paid for on both sides, so absence has to be `hidden`
      // (not a flex item at all) rather than a zero width.
      entry.container.hidden = absent;
      const rung = collapsed ? null : rungOf(effective, id);
      if (rung === null && !absent) {
        evicted.push(id);
      } else {
        dockInline(root, entry.container, anchor);
      }
    }
    // ORDER IS LOAD-BEARING: the inline loop above ran first, and that is what
    // discharges `dockGroup`'s "no strays" precondition. An occupant coming back
    // from the panel to the row has already been pulled out by its own
    // `dockInline`, so the eviction dock holds nothing absent from `evicted` and
    // `planMoves`' `beforeId: null` genuinely means "append". Running this pass
    // first would leave a returning occupant sitting in the dock while the plan
    // assumed it gone.
    const evictionDock = overflow === "panel" ? panelDock : parkingDock;
    if (evictionDock !== null) {
      dockGroup(evictionDock, evicted, (id) => entries.get(id)?.container);
    }
    // A panel that has just emptied is dead chrome holding focus, so it closes.
    // This is the ONE placement-driven close, and it lives here rather than in
    // an effect because "the panel became empty" is a fact this pass computed.
    // A resize alone never closes it.
    if (evicted.length === 0) setPanelOpen(false);

    // Degraded: the placement above IS "everyone inline", and there is nothing
    // left to decide. Returning here rather than skipping the whole pass keeps
    // a late-arriving occupant docked like the rest.
    if (degraded) return;

    // The authored bucket has no width to consult — membership is the author's
    // decision, so there is nothing to measure and nothing to converge.
    if (collapsed) {
      const next = new Map<string, number | null>();
      for (const { id, entry } of order) {
        if (entry.container.hidden !== true) next.set(id, null);
      }
      if (!samePlacement(next, placement)) setPlacement(next);
      return;
    }

    // ── 2. Measure ────────────────────────────────────────────────────────
    const available = measure(root);
    // Zero available width is "not laid out yet" — a collapsed pane, a
    // display:none ancestor, a jsdom test with no measurement seam. Deciding
    // from it would evict the whole row and then put it back, so we decide
    // nothing and wait for a width.
    //
    // That reading is only honest while the row still holds everything it was
    // given. With occupants already OUT of it, a zero can be the bar's own
    // doing — an empty row measures empty — and then waiting is waiting for a
    // width that only re-admitting them could produce. That is the one
    // absorbing state this primitive can reach, so it is a fault, not a pause.
    if (available <= 0) {
      if (evicted.length > 0) {
        setDegraded(true);
        failLoudly({
          kind: "no-slack",
          label,
          overflow,
          ...originOf(root),
          message:
            "the row measured 0px wide while occupants were relocated out of it, so the only width the bar can read is the one its own evictions produced. Re-admitted everything.",
        });
      }
      return;
    }

    // The bar's whole premise: `available` is handed to it and does not move
    // when it decides. Tested against the layout engine rather than inferred
    // from a style — `flex-grow: 1` is no promise of slack when an ancestor
    // shrink-wraps, and that shape reads as healthy on every proxy.
    if (!slackCheckedRef.current) {
      const inline = order
        .filter(
          ({ entry }) =>
            entry.container.parentNode === root &&
            entry.container.hidden !== true,
        )
        .map(({ entry }) => entry.container);
      if (inline.length > 0) {
        slackCheckedRef.current = true;
        if (widthFollowsContent(root, inline, measure)) {
          setDegraded(true);
          failLoudly({
            kind: "no-slack",
            label,
            overflow,
            ...originOf(root),
            message:
              "the bar's own width moves with its own content, so every eviction shrinks the width that decides the next one — a one-way ratchet with an empty row at the end of it. Put it where there is room to give: as the growing cell of a single-line row, with no Fill or other flex-1 sibling competing for the same slack, and never inside a shrink-to-content parent (inline-flex, w-fit, Cluster, or a wrapper that relays shrink but not grow). One adaptive bar per row.",
          });
          return;
        }
      }
    }

    // ── The stop ──────────────────────────────────────────────────────────
    // A surrendered bar still DOCKS — section 1 ran, so an occupant that
    // mounted or unmounted since is placed correctly — but it does not decide.
    // Everything below is the search, and a fault says the search cannot be
    // trusted AT THIS WIDTH.
    //
    // Below the measurement rather than above it, because "has the premise
    // changed" is a question about the width. A resize is the one event that
    // makes re-deriving legitimate, and it cannot be self-inflicted: the bar is
    // the grow cell, so this number comes from its row and never from its own
    // content — which the slack probe just above has now VERIFIED of the layout
    // engine rather than assumed. `MAX_SURRENDERS` is the backstop anyway.
    if (surrenderedRef.current) {
      const surrenderedAt = surrenderedAtRef.current;
      const resized =
        surrenderedAt === null ||
        Math.abs(available - surrenderedAt) > HYSTERESIS_PX;
      if (!resized || surrenderCountRef.current >= MAX_SURRENDERS) return;
      surrenderedRef.current = false;
      startEpisode(episodeRef.current);
    }

    const gapPx = readColumnGap(root);
    const triggerPx =
      overflow === "panel"
        ? measureTrigger(trigger, measure, triggerWidthRef)
        : 0;

    /** Every occupant this pass could legitimately read — the round's premise. */
    const measured: RoundItem[] = [];
    for (const { id, entry } of order) {
      const rung = rungOf(placement, id);
      if (rung === null) continue;
      // Only an INLINE node is measurable. A width read in the panel describes
      // the panel's layout, not the row's, and would poison every later fit —
      // `write` refuses it, and this is the caller half of that contract.
      if (
        entry.container.parentNode !== root ||
        entry.container.hidden === true
      )
        continue;
      const px = measure(entry.container);
      measured.push({ id, rung, px });
      const known = estimate(cacheRef.current, id, rung);
      if (known.kind === "exact" && known.px !== px) {
        // The item's own size changed, so what we believe about its OTHER rungs
        // is hearsay. Kept as estimates rather than deleted: an item sitting at
        // rung 1 is only measurable at rung 1, so dropping the rest would strand
        // it there forever.
        cacheRef.current = staleOthers(cacheRef.current, id, rung);
      }
      const result = write(cacheRef.current, {
        id,
        rung,
        px,
        dockedInline: true,
      });
      // A refusal is information, not an error: a 0 means the contribution
      // rendered nothing, which the `hidden` flag above already recorded.
      if (result.ok) cacheRef.current = result.cache;
    }

    // ── The premise ───────────────────────────────────────────────────────
    // Was this round asking the same question as the last one? Only then is a
    // changed answer evidence that the search does not settle. A resize, a
    // contribution mounting, or an occupant resizing itself at a rung it was
    // already sitting at are all "somebody moved the row underneath us" — the
    // rounds before are about a width that no longer exists, so they are not
    // rounds of this search and the counter starts again.
    //
    // The restriction to an UNCHANGED rung is what keeps this from dissolving
    // the bound: an occupant that just changed rung is SUPPOSED to measure
    // differently, and treating that as a moving premise would reset the
    // counter on every round of the bar's own chain. `episode.total` bounds the
    // other side — see HARD_ROUND_CEILING.
    const episode = episodeRef.current;
    const round: Round = {
      available,
      shape: order
        .map(
          ({ id, entry }) =>
            `${id}:${String(inlineRungsOf(entry.ladder).length)}`,
        )
        .join(","),
      items: measured,
    };
    const previous = episode.premise;
    episode.premise = round;
    pushRound(episode.trace, round, TRACE_ROUNDS);
    if (previous !== null) {
      const shift = premiseShift(previous, round, WIDTH_EPSILON_PX);
      if (isShifted(shift)) {
        episode.rounds = 0;
        episode.shifts += 1;
        recordMoves(episode.moved, shift.moved);
      }
    }

    // ── 3. Decide ─────────────────────────────────────────────────────────
    const items: FitItem[] = order.map(({ id, entry }) => {
      const rungCount = inlineRungsOf(entry.ladder).length;
      return {
        id,
        inlineWidths: inlineWidthsFor(cacheRef.current, id, rungCount),
        evictable: overflow !== "scroll" && !entry.immovable,
        yieldRank: yieldRankOf(entry.ladder),
        pinned:
          entry.holds > 0 ||
          entry.popupOpen ||
          entry.pointerPinned ||
          entry.immovable,
        currentRung: rungOf(placement, id),
        absent: entry.container.hidden === true,
      };
    });

    const result = assign({
      available,
      gap: gapPx,
      triggerPx,
      hysteresisPx: HYSTERESIS_PX,
      items,
      blocked: blockedRef.current,
    });
    // This round's OUTPUT, kept on the round so a repeat is recognisable as a
    // cycle in the fit rather than as a premise that keeps moving. Two different
    // defects, two different fixes, and only the evidence can tell them apart.
    round.decided = placementKey(result.placement);

    // H2: a promotion we COMMITTED, then measured, and are now undoing at the
    // same width was a promotion this row cannot afford. Bar that rung until the
    // row is genuinely wider than the width that rejected it — the failed
    // promotion measured the true width, so this costs at most one round trip
    // per (item, rung) per content change, not one per resize.
    for (const [id, promotedRung] of promotedRef.current) {
      const now = result.placement.get(id);
      if (now === undefined) continue;
      if (now === null || now > promotedRung) {
        blockedRef.current.set(id, { rung: promotedRung, atWidth: available });
      }
    }

    // The best answer the search has produced so far, kept for the case where it
    // runs out of rounds. `fits` from measurements alone — an estimate can
    // refuse a fit but never fabricate one, so a `fits` reached through
    // estimates is a weaker claim than the one this fallback needs to make.
    if (result.fits && !result.usedEstimate) {
      episode.best = { placement: result.placement, available };
    }

    if (samePlacement(result.placement, placement)) {
      // The episode is over: the counters, the premise and the evidence all
      // belong to a search that has finished, and carrying them into the next
      // one would blame it for rounds it never ran.
      startEpisode(episode);
      promotedRef.current.clear();

      // The row-overflow guard belongs HERE, and only here.
      //
      // It compares what the fit believes against what the layout engine did —
      // so the two have to describe the SAME configuration.
      // `measureRowOverflow` measures the row as currently rendered, which is
      // the COMMITTED placement; `result` is what we are about to commit. On
      // any pass where they differ, the row on screen is the one we already
      // know is wrong and are in the middle of fixing, so checking it there
      // reports a disagreement that does not exist — and, in dev, throws over
      // it.
      //
      // Converged means rendered == blessed, which is the only state in which
      // "the fit says it fits and the row does not" is a real contradiction.
      //
      // `usedEstimate` deliberately does NOT gate this. An estimate is an upper
      // bound, so it can refuse a fit but never fabricate one: a `fits: true`
      // reached through estimates is still a claim the row fits, and an
      // overflowing row still contradicts it.
      //
      // In `scroll` mode the row overflowing IS the contract — nothing leaves
      // the row and the row scrolls — so there is no contradiction to detect.
      // The skip is mandatory rather than cosmetic: the root is user-scrollable
      // there, so the occupants' rects shift with `scrollLeft`, and flooring a
      // bar that was asked to scroll would shrink every one of them.
      if (layoutMeasured && overflow !== "scroll" && result.fits) {
        const overflowingBy = measureRowOverflow(root, order, trigger);
        if (overflowingBy > 0) {
          // The floor, unconditionally: the fit's own numbers have just been
          // contradicted by the engine, so "the widest placement the fit blessed
          // as fitting" is exactly the claim under suspicion.
          commitFloor(items, overflow, setPlacement, surrender, available);
          failLoudly({
            kind: "row-overflow",
            label,
            overflow,
            ...originOf(root),
            message: `the fit says everything fits and the rendered row still overflows the box the bar was given, by ${String(Math.round(overflowingBy))}px — so the widths the fit decided from are not the widths the row actually has.`,
          });
        }
      }
      return;
    }

    episode.rounds += 1;
    episode.total += 1;
    // Three bounds, three diagnoses, one remedy. They are counted separately
    // because they are different bugs with different owners, and the fault says
    // which one tripped:
    //
    // - `rounds` is the search's own cost, derived from the steps this row has
    //   to give. Over it means the fit really is not settling at a premise that
    //   held still.
    // - `shifts` means the widths under this bar never stopped moving. Not the
    //   search's fault, but not something to keep re-deciding through either.
    // - `total` is the one nothing resets. It is what makes tolerating a moving
    //   premise safe rather than unbounded — see HARD_ROUND_CEILING.
    const stopped =
      episode.rounds > passBudget(items)
        ? `the placement still changed after ${String(episode.rounds)} measure-and-decide rounds at a premise that held still`
        : episode.shifts > MAX_PREMISE_SHIFTS
          ? `the widths underneath this bar moved ${String(episode.shifts)} times without the placement ever settling`
          : episode.total > HARD_ROUND_CEILING
            ? `this bar has re-decided ${String(episode.total)} times without ever settling`
            : null;
    if (stopped !== null) {
      const evidence = summarizeRounds(episode.trace, episode.moved, {
        rounds: episode.rounds,
        shifts: episode.shifts,
        total: episode.total,
      });
      const remedy = commitSurrender(
        items,
        episode.best,
        overflow,
        setPlacement,
        surrender,
        available,
      );
      failLoudly({
        kind: "no-convergence",
        label,
        ...originOf(root),
        overflow,
        message: `${stopped}. ${describeEvidence(evidence)} ${remedy} The bar has stopped deciding until the row is genuinely resized.`,
        evidence,
      });
      return;
    }

    promotedRef.current.clear();
    for (const { id } of order) {
      const from = rungOf(placement, id);
      const to = result.placement.get(id);
      if (to === undefined || to === null) continue;
      if (from === null || to < from) promotedRef.current.set(id, to);
    }
    setPlacement(result.placement);
  }, [
    root,
    trigger,
    panelDock,
    parkingDock,
    placement,
    effective,
    degraded,
    surrender,
    collapsed,
    overflow,
    label,
    measure,
    layoutMeasured,
  ]);

  // ONE subscription covering everything that can change a width: the row's own
  // size, the trigger's, and every occupant's — which folds in content change,
  // font load, control-density change, theme change and zoom. Its first callback
  // runs SYNCHRONOUSLY inside the layout effect, which is what gives the cold
  // start no flash: measure, decide and re-commit all happen before paint.
  useResizeObserver(
    () => {
      if (root === null) return null;
      const observed: Element[] = [root];
      if (trigger !== null) observed.push(trigger);
      for (const entry of entriesRef.current.values())
        observed.push(entry.container);
      return observed;
    },
    reconcile,
    { deps: [reconcile, version, editMode] },
  );

  // ── The two contract-free locks ──────────────────────────────────────────
  // React synthetic events bubble the FIBER tree, not the DOM tree, so the bar's
  // own root sees a pointer-down inside a widget that physically lives in the
  // body-portaled panel. That is what makes this work with no author opt-in:
  // the item under the pointer is pinned for the duration of the gesture, and
  // `useHoldShrink` is left to cover only what survives the release.
  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent): void => {
      const target = e.target as Node | null;
      if (target === null) return;
      for (const entry of entriesRef.current.values()) {
        if (!entry.container.contains(target)) continue;
        entry.pointerPinned = true;
        // A release outside the bar (the pointer left the widget, or capture was
        // never taken) would never reach a React handler here, and a permanently
        // pinned item is worse than a moved one. The document listeners are the
        // fail-safe, and they run once.
        const release = (): void => {
          entry.pointerPinned = false;
          document.removeEventListener("pointerup", release, true);
          document.removeEventListener("pointercancel", release, true);
          bump();
        };
        document.addEventListener("pointerup", release, true);
        document.addEventListener("pointercancel", release, true);
        return;
      }
    },
    [bump],
  );

  // Detect the one case a plain re-parent destroys outright, once per item, at
  // the moment we would otherwise move it.
  useLayoutEffect(() => {
    if (supportsStatePreservingMove()) return;
    for (const entry of entriesRef.current.values()) {
      if (entry.immovable || !holdsIframe(entry.container)) continue;
      entry.immovable = true;
      reportFault({
        kind: "iframe-relocation",
        label,
        overflow,
        ...(root === null ? {} : originOf(root)),
        message: `bar item "${entry.id}" contains an <iframe> and this browser has no moveBefore(), so relocating it would reload the frame. It is pinned in the row instead.`,
      });
      bump();
    }
  }, [version, label, bump, root, overflow]);

  const rootClass = collapsed
    ? cn(BAR_COLLAPSED_ROOT, className)
    : cn(
        BAR_ROOT,
        overflow === "scroll" ? BAR_SCROLL : BAR_CLIP,
        align === "end" && BAR_ALIGN_END,
        className,
      );

  return (
    <BarRegistryContext.Provider value={registry}>
      <BarFormsContext.Provider value={forms}>
        {/*
          A bar is a single-line strip by contract: a raw string or chip inside
          it must not wrap the row into two lines, and a `<Text>` leaf inside a
          widget must ellipsize rather than grow the row it is being measured
          against.
        */}
        <SingleLineProvider value={true}>
          <Stack
            ref={setRoot}
            direction="row"
            align="center"
            gap={gap}
            className={rootClass}
            onPointerDownCapture={onPointerDownCapture}
          >
            {children}
            <span
              ref={setTrigger}
              data-adaptive-bar-trigger=""
              hidden={!showTrigger}
            >
              <IconButton
                icon={MdMoreHoriz}
                label={label}
                aria-haspopup="dialog"
                aria-expanded={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              />
            </span>
            {/*
              The parking dock: a live, hidden parent that always exists inside
              the bar. `overflow="clip"` drops occupants here rather than
              detaching them, so a container is never orphaned and a clipped
              widget comes back as the same instance the moment the row is wider.
            */}
            <div hidden ref={setParkingDock} />
          </Stack>
        </SingleLineProvider>
        <OverflowPanel
          open={panelOpen}
          anchor={trigger}
          label={label}
          dockRef={setPanelDock}
          onDismiss={() => setPanelOpen(false)}
        />
      </BarFormsContext.Provider>
    </BarRegistryContext.Provider>
  );
}

/**
 * The trigger's real width, never a hardcoded constant — a `MORE_BTN_W = 32`
 * is simply wrong at any other control density, and density is ambient.
 *
 * The trigger is `hidden` while nothing is evicted, so the very first fit has
 * nothing to read. Revealing it, measuring, and re-hiding inside one
 * synchronous block costs one forced reflow ONCE per bar (the answer is cached
 * and re-measured by the shared observer whenever the trigger is genuinely
 * visible) and is invisible to both React and the paint.
 */
function measureTrigger(
  trigger: HTMLElement | null,
  measure: (el: Element) => number,
  cache: { current: number | null },
): number {
  if (trigger === null) return cache.current ?? 0;
  if (!trigger.hidden) {
    const px = measure(trigger);
    if (px > 0) cache.current = px;
    return cache.current ?? 0;
  }
  if (cache.current !== null) return cache.current;
  trigger.hidden = false;
  const px = measure(trigger);
  trigger.hidden = true;
  // Same `px > 0` guard as the visible branch, and for a sharper reason: a 0
  // cached HERE is permanent. A hidden element reports no resize, so the shared
  // observer can never repair it, and every later fit would under-reserve the
  // trigger's width and manufacture a row that overflows by exactly one button.
  if (px > 0) cache.current = px;
  return px;
}

/**
 * Does this bar's width follow its own content?
 *
 * The one question the whole primitive rests on, asked of the layout engine
 * directly instead of inferred from a style. Hide everything the row is
 * currently holding, read the row again, put it back: a bar that was GIVEN its
 * width measures the same either way, and a bar sitting in a box that
 * shrink-wraps to it measures its own content twice.
 *
 * Every cheaper proxy misses the shape that actually ships. `flex-grow: 0` is
 * false here — the bar sets `flex-1` on itself, so the failing case reads as
 * healthy — and `measureRowOverflow` cannot fire either, because a bar whose box
 * grew to fit its own content is not overflowing that box. Both proxies describe
 * the bar's own declaration; only this one describes what the engine did with it.
 *
 * One forced reflow, once per bar, and invisible to React and to the paint:
 * the mutation is reverted inside the same synchronous block, so the shared
 * `ResizeObserver` compares against sizes that never changed. Same discipline
 * as {@link measureTrigger}, which reveals the hidden trigger to measure it.
 *
 * Goes through the measurement seam rather than `getBoundingClientRect`, so the
 * jsdom suite can model a shrink-wrapping host and drive this exact path —
 * a real fixture, not a mock of the thing under test.
 */
function widthFollowsContent(
  root: HTMLElement,
  inline: readonly HTMLElement[],
  measure: (el: Element) => number,
): boolean {
  const withContent = measure(root);
  const wasHidden = inline.map((el) => el.hidden);
  for (const el of inline) el.hidden = true;
  const withoutContent = measure(root);
  inline.forEach((el, i) => {
    el.hidden = wasHidden[i] ?? false;
  });
  // A pixel of tolerance: sub-pixel layout rounding is not content dependence,
  // and the failure this catches is measured in whole occupants.
  return Math.abs(withContent - withoutContent) > 1;
}

/**
 * Every unpinned occupant at its narrowest rung — the one configuration
 * guaranteed not to overflow, and therefore what we commit when we stop
 * believing the search.
 *
 * Only for a fault whose width reading is TRUSTWORTHY and whose fit disagrees
 * with the engine anyway. When the width itself is the lie, the floor is the
 * wrong direction entirely and `degraded` (the ceiling) is the remedy — taking
 * occupants out of the row is precisely what a bad width was already doing.
 *
 * **It is also the last placement this bar computes at this width**, and that
 * is why the surrender is latched HERE rather than by the callers: flooring and
 * stopping are one act, so there is no spelling of "take the floor and keep
 * deciding".
 *
 * That spelling is what took the Layout Lab pane down. A floor commit changes
 * the placement, a changed placement re-runs the measure-and-decide effect, and
 * the fit — deliberately current-state-independent apart from pins and
 * hysteresis — recomputes the same ideal it had before, converges, trips the
 * same guard, and floors again. Neither counter could stop it: the convergence
 * branch and the commit both reset the round counter, so the budget counted a
 * number that was being zeroed underneath it, and React eventually threw
 * "maximum update depth exceeded" over a layout disagreement.
 *
 * Scoped to the WIDTH rather than the mount, and that distinction is load-
 * bearing rather than cautious. `no-convergence` is often transient — a font
 * arriving mid-pass, a late icon — and it is observed on ordinary healthy
 * surfaces; parking such a bar at its floor until the pane is reopened buries
 * every action in the `⋯` panel, which is worse than the fault.
 * {@link MAX_SURRENDERS} bounds the re-arms.
 */
function commitFloor(
  items: readonly FitItem[],
  overflow: AdaptiveBarOverflow,
  setPlacement: (next: Placement) => void,
  surrender: Surrender,
  atWidth: number,
): void {
  surrender.surrendered.current = true;
  surrender.at.current = atWidth;
  surrender.count.current += 1;
  const floor = new Map<string, number | null>();
  for (const item of items) {
    if (item.absent === true) continue;
    if (item.pinned === true) {
      floor.set(item.id, item.currentRung);
      continue;
    }
    // Evicting is only a remedy where an evicted occupant is still REACHABLE,
    // and that is `panel` alone. `clip` drops its evictions into a hidden
    // parking dock, so flooring a clip bar hides every occupant it holds — a
    // strictly worse outcome than the clipping that mode already accepts, and
    // for a fault whose whole premise is "my width reading is honest".
    const evictable = item.evictable && overflow === "panel";
    floor.set(item.id, evictable ? null : item.inlineWidths.length - 1);
  }
  setPlacement(floor);
}

/**
 * Stop deciding, and commit the best answer this search actually produced.
 *
 * A search that runs out of rounds has usually produced perfectly good answers
 * along the way, and the floor throws all of them away: every occupant at its
 * narrowest rung, everything evictable behind the `⋯`. That is what makes a
 * *transient* fault cost the user their whole toolbar, and the fault is
 * transient often enough to be worth this.
 *
 * The floor's one virtue is that it cannot overflow. A placement the fit blessed
 * as `fits` from measurements alone (never estimates, which can refuse a fit but
 * never fabricate one) carries the same claim, by the same arithmetic, and is
 * strictly wider — so it is preferred whenever the search produced one AT THIS
 * WIDTH. The width test is not decoration: a placement that fitted 900px says
 * nothing about 400px.
 *
 * Latching lives HERE, in both branches, and that is the load-bearing part.
 * Committing and stopping are one act, so there is no spelling of "take the
 * fallback and keep deciding" — which is precisely what took the Layout Lab pane
 * down: a commit changes the placement, a changed placement re-runs the
 * measure-and-decide effect, the fit recomputes the same answer, trips the same
 * guard, and commits again, forever.
 *
 * Scoped to the WIDTH rather than the mount, bounded by {@link MAX_SURRENDERS}:
 * a genuine resize is a premise this bar has not failed under, and refusing to
 * re-derive there would park a toolbar for the life of the pane.
 *
 * Returns the sentence describing what it did, for the fault message — so the
 * remedy cannot be described by a caller that does not know which branch ran.
 */
function commitSurrender(
  items: readonly FitItem[],
  best: { placement: Placement; available: number } | null,
  overflow: AdaptiveBarOverflow,
  setPlacement: (next: Placement) => void,
  surrender: Surrender,
  atWidth: number,
): string {
  if (best !== null && Math.abs(best.available - atWidth) <= WIDTH_EPSILON_PX) {
    surrender.surrendered.current = true;
    surrender.at.current = atWidth;
    surrender.count.current += 1;
    setPlacement(best.placement);
    return "Committed the widest placement this search measured as fitting, rather than throwing the whole search away.";
  }
  commitFloor(items, overflow, setPlacement, surrender, atWidth);
  return overflow === "panel"
    ? "The search never produced a placement it could vouch for at this width, so the bar took the floor: every unpinned occupant at its narrowest rung, everything else in the overflow panel."
    : "The search never produced a placement it could vouch for at this width, so the bar took the floor: every unpinned occupant at its narrowest rung, all of them still in the row.";
}

/**
 * Start counting again: these rounds were not part of the search that is about
 * to run.
 *
 * Called from the two places an episode genuinely ends — a converged pass, and
 * a surrender re-armed by a real resize. Takes the whole {@link Episode} for the
 * same reason {@link Surrender} is bundled: a caller able to reset the counter
 * but not the evidence would file a fault describing a different episode, and a
 * caller able to reset `total` would give back the termination bound.
 *
 * `premise` is deliberately NOT cleared. It describes the row as it currently
 * is, not the search — so the first round of the next episode can still say
 * whether a width moved underneath it.
 */
function startEpisode(episode: Episode): void {
  episode.rounds = 0;
  episode.total = 0;
  episode.shifts = 0;
  episode.trace.length = 0;
  episode.moved.clear();
  episode.best = null;
}

/** A placement as one comparable string — for spotting a repeat, not for equality. */
function placementKey(placement: ReadonlyMap<string, number | null>): string {
  return [...placement]
    .map(([id, rung]) => `${id}:${rung === null ? "-" : String(rung)}`)
    .sort()
    .join(",");
}

/**
 * Where this bar is written.
 *
 * A generic primitive has no name of its own, and the one its consumer gave it
 * (`label`) is not an identity: it defaults to `"More"`, and two unrelated bars
 * on one route take that default today. The DOM already holds the answer — the
 * innermost UI-context node above the bar's root, which resolves to
 * `apps-core.tab-bar@apps.tab-bar` for the app tab strip and
 * `conversations.conversation-view.prompt-templates@prompt-editor.floating-action`
 * for the pinned prompt-template chips. Measured on the live app, not assumed.
 *
 * Deliberately NOT `nearestSource` (the build-stamped `<file>:<line>` the
 * element picker uses), even though it reads like the better name: the nearest
 * stamped element above a bar root is the picker's own marker span, or a
 * primitive the consumer composed — never the consumer. It would have been the
 * same constant for every bar in the app.
 *
 * The full lineage path is carried separately and never fingerprinted: it embeds
 * per-instance region ids, so two conversation panes would split one finding in
 * two — the mirror of the collision this exists to fix.
 *
 * On the fault path only. The walk climbs ancestors and portal chains, which is
 * far too much to pay per pass and exactly nothing to pay per fault.
 */
function originOf(root: HTMLElement): { origin?: string; originPath?: string } {
  const nodes = collectLineage(root);
  const innermost = nodes[nodes.length - 1];
  const path = formatLineagePath(nodes);
  // A contribution node is already an id-free name (`plugin@slot`), and
  // `formatLineageNode` is where that spelling lives — re-spelling it here is
  // how two consumers of one grammar drift. A region node is NOT usable as it
  // stands: its spelling carries the per-instance pane/tab id, so it is reduced
  // to the parts that are the same on every mount.
  const origin =
    innermost === undefined
      ? undefined
      : innermost.kind === "contribution"
        ? formatLineageNode(innermost)
        : `${innermost.pluginId ?? ""}#${innermost.regionKind}`;
  return { origin, originPath: path === "" ? undefined : path };
}

function samePlacement(a: Placement, b: Placement): boolean {
  if (a.size !== b.size) return false;
  for (const [id, rung] of a) {
    if (!b.has(id) || b.get(id) !== rung) return false;
  }
  return true;
}

/** A px length off a computed style, where "not a length" means zero. */
function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * By how much does the rendered row stick out of the box the bar was given?
 *
 * The second half of the grow-cell contract. `widthFollowsContent` catches "the
 * width I read is not a width I was given" once, at mount; this catches the
 * case where the width is honest and the fit's own numbers are not — per pass,
 * against the rendered result rather than an assumption.
 *
 * **The occupants against the bar's own content box — never an ancestor.**
 * This question used to be put to `root.offsetParent`, which is the nearest
 * *positioned* ancestor: a different thing from "the row I am a cell of", and
 * one that can be anywhere on the page. A bar inside a horizontally scrolled
 * strip sits hundreds of pixels to its right in viewport space while fitting
 * its own row perfectly, and was accused on every pass — which is what killed
 * the Layout Lab, where every fixture card has exactly that shape. Do not
 * reintroduce an ancestor comparison in any form; `parentElement` is no better,
 * since the parent may shrink or carry padding of its own.
 *
 * **And not `root.scrollWidth > root.clientWidth` either**, tempting as the
 * one-liner is. LTR scrollable overflow ignores content past the *left* edge,
 * and `align="end"` packs the occupants against the far edge — so a pane header
 * (every one of which is `align="end"`) overflowing by 16px reads
 * `scrollWidth === clientWidth`. Measured, not assumed. It also folds in
 * *descendants'* overflow, so a widget's own `active:scale` transform or an
 * absolutely-positioned badge would inflate it into a false accusation, and a
 * false accusation costs the whole pane.
 *
 * Reading the occupant containers instead is exact on both counts: each rect is
 * that container's own border box, so nothing a widget paints inside itself
 * leaks into the answer, and the union covers both directions.
 */
function measureRowOverflow(
  root: HTMLElement,
  order: readonly { entry: BarItemEntry }[],
  trigger: HTMLElement | null,
): number {
  const rect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const box = {
    left: rect.left + px(style.paddingLeft) + px(style.borderLeftWidth),
    right: rect.right - px(style.paddingRight) - px(style.borderRightWidth),
  };

  const spans: Span[] = [];
  const addIfLaidOut = (el: HTMLElement): void => {
    // Two filters, both load-bearing. A container whose parent is not the root
    // has been relocated into the body-portaled panel, so its rect describes the
    // panel's layout and says nothing about this row. And an element generating
    // NO boxes (`hidden`, which is how absence and the un-needed `⋯` are both
    // spelled) reports a rect of all zeros — at the viewport origin, which would
    // fabricate a full-width LEFT overflow on every bar. The layout harness
    // documents the same trap for `display: none` slots.
    if (el.parentNode !== root) return;
    if (el.getClientRects().length === 0) return;
    const r = el.getBoundingClientRect();
    spans.push({ left: r.left, right: r.right });
  };
  for (const { entry } of order) addIfLaidOut(entry.container);
  if (trigger !== null) addIfLaidOut(trigger);

  return overflowPx(box, spans);
}
