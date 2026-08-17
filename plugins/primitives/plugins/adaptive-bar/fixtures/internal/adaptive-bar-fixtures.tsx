import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { MdSearch, MdSettings, MdShare, MdVolumeUp } from "react-icons/md";
import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import {
  useActionForm,
  useHoldShrink,
} from "@plugins/primitives/plugins/action-presentation/web";
import {
  AdaptiveBar,
  type AdaptiveBarAlign,
} from "@plugins/primitives/plugins/adaptive-bar/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

/**
 * The proof surface.
 *
 * Every surface this primitive can reach in its first pass — pane headers, the
 * authored reorder bucket, the tab strip — is made of plain actions, so none of
 * them exercises the premise: *a draggable widget relocates and is still
 * draggable*. The layout harness does, and it is a genuinely good fit rather
 * than a workaround: it renders real components with real Tailwind, sweeps each
 * fixture across a range of container widths in a real headless Chromium, and
 * judges the measured `[data-geo]` boxes through a generic oracle that never
 * names a primitive's internals.
 *
 * What the sweep proves here: at every width, no two occupants overlap and
 * nothing — including the `⋯` trigger — spills past the row it was given. The
 * bar is the grow cell of a full-width line, so its right edge IS the
 * container's: "nothing clips the container" and "the bar never overshoots its
 * parent" are the same assertion measured once.
 *
 * What the sweep can NOT prove is that the relocated slider still drags, or
 * that it is the same instance afterwards — geometry has nothing to say about
 * either. That is `e2e/adaptive-bar-relocate.ts`, driving this same fixture in
 * the live Layout Lab.
 */

/**
 * A jog wheel: a real pointer-drag control with no smaller form of itself.
 *
 * The whole point of the fixture. A ribbed drag face at 40px is not a control,
 * so it declares NO rungs — meaning the bar may leave it alone or relocate it
 * as itself, and can never turn it into a labelled row. It holds its
 * assignment while a drag is in flight, and mints an identity once per mount so
 * the e2e can prove the instance survived the round trip.
 */
let wheelMounts = 0;

function JogWheel(): ReactElement {
  const [instanceId] = useState(
    () => `jog-wheel-${String((wheelMounts += 1))}`,
  );
  const [value, setValue] = useState(40);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // One rung: stay full, or relocate as myself. Eager, so the sweep reaches the
  // interesting state (a rich widget in the panel) before it runs out of width.
  useActionForm({ yields: "early" });
  // The bar pins the item under an active pointer by itself; this covers what
  // survives the release, which for a real jog wheel is the inertial coast.
  useHoldShrink(dragging);

  function valueAt(clientX: number): number {
    const track = trackRef.current;
    if (track === null) return value;
    const box = track.getBoundingClientRect();
    if (box.width === 0) return value;
    const ratio = (clientX - box.left) / box.width;
    return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  }

  return (
    <Stack direction="row" gap="2xs" align="center" data-geo="wheel">
      <Text variant="caption" tone="muted">
        Jog
      </Text>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Jog"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        data-instance-id={instanceId}
        className="h-4 w-28 rounded-full bg-muted"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setValue(valueAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging) setValue(valueAt(e.clientX));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setValue((v) => Math.min(100, v + 5));
          if (e.key === "ArrowLeft") setValue((v) => Math.max(0, v - 5));
        }}
      >
        <div
          className="h-4 rounded-full bg-primary"
          style={{ width: `${String(value)}%` }}
        />
      </div>
      <Text variant="caption" tone="muted" data-testid="jog-readout">
        {String(value)}
      </Text>
    </Stack>
  );
}

/**
 * A widget with a genuine smaller form of itself: a labelled slider at full, an
 * icon button at compact. It is what makes the sweep exercise the LADDER rather
 * than just the eviction — at a middle width the row keeps it and shrinks it,
 * and only past that does it leave.
 */
function VolumeControl(): ReactElement {
  const form = useActionForm({ shrinksTo: ["compact"] });
  const [value, setValue] = useState(70);

  if (form === "compact") {
    return (
      <span data-geo="volume">
        <IconButton
          icon={MdVolumeUp}
          label="Volume"
          onClick={() => setValue((v) => (v === 0 ? 70 : 0))}
        />
      </span>
    );
  }
  return (
    <Stack direction="row" gap="2xs" align="center" data-geo="volume">
      <MdVolumeUp className="icon-auto" />
      <div className="h-4 w-24 rounded-full bg-muted">
        <div
          className="h-4 rounded-full bg-primary"
          style={{ width: `${String(value)}%` }}
        />
      </div>
    </Stack>
  );
}

/**
 * Stamps the harness's `data-geo` vocabulary onto the bar's own trigger.
 *
 * The primitive must not know the harness exists, and the harness measures
 * `[data-geo]` — so the fixture bridges the two, over the trigger's own stable
 * marker attribute. That is what puts "the `⋯` never spills the row" under the
 * same `noClip` invariant as the occupants, instead of leaving it to eyeball.
 */
function useTriggerGeoSlot(): (el: HTMLElement | null) => void {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (host === null) return;
    host
      .querySelector("[data-adaptive-bar-trigger]")
      ?.setAttribute("data-geo", "trigger");
  }, [host]);
  return setHost;
}

/**
 * An occupant the layout engine WOULD squeeze, if the bar let it — and the only
 * one in the catalog that can be, which is worth understanding before writing
 * another.
 *
 * An item container is a flex item of the row with `min-width: auto`, so its
 * floor is its own **min-content**. Every other occupant here reaches that floor
 * at its natural width: the row is `whitespace-nowrap`, a text run that cannot
 * break has a min-content equal to its max-content, and `Button` is `shrink-0`
 * outright. `min-w-0` inside a widget does not change this — it lets the LEAF be
 * smaller, not the box the bar measures.
 *
 * What does: **content that can reflow narrower**. This chip opts back into
 * wrapping, so its min-content is its longest word and the engine can take most
 * of its width. A widget rendering a short sentence is the realistic version;
 * a percentage-sized image is another. Neither is exotic, and neither is
 * expressible as a rung — which is the point: the bar's ladder is the only
 * shrinking an occupant should ever do.
 *
 * Declares no ladder on purpose: one rung, so the width the harness measures
 * cannot change for any legitimate reason. Anything that moves it is the engine
 * taking width from the occupant.
 */
function LabelledChip({ label }: { label: string }): ReactElement {
  return (
    // `whitespace-normal` overrides the row's own `nowrap`, which is what gives
    // this box a min-content below its natural width. Not a style choice — it is
    // the entire mechanism under test.
    <div className="whitespace-normal rounded-md border px-xs py-2xs">
      {label}
    </div>
  );
}

/**
 * Stamps the harness's `data-geo` vocabulary onto the bar's own OCCUPANT
 * containers, over their stable marker attribute.
 *
 * The box that has to be proven rigid is the container the bar measures and
 * writes into the ledger — not the widget inside it, which is a block child of
 * that container and would be dragged along by a squeeze without being the
 * number under test. The primitive must not know the harness exists, so the
 * fixture bridges the two, exactly as {@link useTriggerGeoSlot} does for the
 * `⋯`.
 *
 * No dependency array: an occupant relocated into the body-portaled panel and
 * back is not in this subtree in between, and re-stamping every render is both
 * cheaper and more obviously correct than tracking that.
 */
function useOccupantGeoSlots(
  ids: readonly string[],
): (el: HTMLElement | null) => void {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (host === null) return;
    host
      .querySelector("[data-adaptive-bar-trigger]")
      ?.setAttribute("data-geo", "trigger");
    for (const id of ids) {
      host
        .querySelector(`[data-adaptive-bar-item="${id}"]`)
        ?.setAttribute("data-geo", id);
    }
  });
  return setHost;
}

const SQUEEZABLE_IDS = ["alpha", "beta", "gamma", "delta"] as const;

/**
 * The width ledger's axiom, as geometry: **an occupant's width is a property of
 * that occupant, not of how many neighbours it has.**
 *
 * Four single-rung occupants, each holding a truncating leaf, in an ordinary
 * `panel` bar swept from roomy to cramped. At the wide end all four are in the
 * row; at the narrow end the fit relocates some of them behind the `⋯`. What
 * must never happen is the third thing: an occupant that STAYS in the row and
 * gets narrower, which is the engine deciding an occupant's width from the
 * placement and the bar then storing that number as if it were the item's own.
 *
 * `rigidIntegrity` is exactly that assertion — it compares a slot's width
 * across the widths where the slot is present and ignores the ones where it is
 * absent, so eviction is tolerated and a squeeze is not.
 */
function SqueezableBarFixture(): ReactElement {
  const hostRef = useOccupantGeoSlots(SQUEEZABLE_IDS);
  return (
    <Line ref={hostRef} className="w-full">
      <AdaptiveBar gap="xs" label="More labels">
        {SQUEEZABLE_IDS.map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <LabelledChip label={`${id} toolbar section`} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </Line>
  );
}

function RichBarFixture(): ReactElement {
  const hostRef = useTriggerGeoSlot();
  return (
    // The e2e handle. The gallery renders this fixture once per swept width, so
    // the script picks one card, resizes THAT card, and watches one bar's
    // occupants move — which is the only way to ask whether an instance
    // survived, since five side-by-side widths are five different instances.
    <Line ref={hostRef} className="w-full" data-testid="adaptive-bar-rich">
      <AdaptiveBar gap="xs" label="More controls">
        <AdaptiveBar.Item id="search">
          <IconButton icon={MdSearch} label="Search" onClick={() => {}} />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="share">
          <IconButton icon={MdShare} label="Share" onClick={() => {}} />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="settings">
          <IconButton icon={MdSettings} label="Settings" onClick={() => {}} />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="volume">
          <VolumeControl />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="jog">
          <JogWheel />
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </Line>
  );
}

function ActionsBarFixture(): ReactElement {
  const hostRef = useTriggerGeoSlot();
  return (
    <Line ref={hostRef} className="w-full">
      <AdaptiveBar gap="xs" label="More actions">
        <AdaptiveBar.Item id="search">
          <span data-geo="search">
            <IconButton icon={MdSearch} label="Search" onClick={() => {}} />
          </span>
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="share">
          <span data-geo="share">
            <IconButton icon={MdShare} label="Share" onClick={() => {}} />
          </span>
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="settings">
          <span data-geo="settings">
            <IconButton icon={MdSettings} label="Settings" onClick={() => {}} />
          </span>
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </Line>
  );
}

/**
 * How far right of the harness's own box the bar is pushed, and how wide the
 * box it actually has to fit in is. Both are authored rather than swept: the
 * point of these two fixtures is that the bar's own row is comfortable while
 * its position on the page is nowhere near the ancestor a naive guard picks.
 *
 * 1200px is not a magic number so much as "wider than any swept width", so the
 * bar's viewport rect starts past the right edge of the harness wrapper at
 * every width in the sweep.
 */
const STRIP_SPACER_PX = 1200;
const STRIP_CARD_PX = 360;

/**
 * The Layout Lab's own shape, reduced to one card.
 *
 * A bar that fits its row perfectly, parked far to the right of the nearest
 * *positioned* ancestor. The Lab produces this by construction — it renders
 * every fixture once per swept width as a fixed-width card inside a
 * horizontally scrolling strip, so every card after the first sits hundreds of
 * pixels right of the pane box — and it is the shape that killed the pane: the
 * guard used to compare the bar against `root.offsetParent`, the nearest
 * POSITIONED ancestor, which is a different thing from "the row I am a cell
 * of". Here that ancestor is the harness's own `position: relative` width
 * wrapper, hundreds of pixels to the left. Every pass was accused, every
 * accusation floored the bar, flooring re-decided, and React threw "maximum
 * update depth exceeded".
 *
 * Three structural details, each of which the fixture stops reproducing
 * anything without:
 *
 * - **The strip is authored exactly as wide as its two children**, so the flex
 *   row has no free space to distribute and no deficit to recover. The spacer
 *   IS the offset; a spacer that collapsed under flex shrinking would quietly
 *   delete the premise.
 * - **The card holding the bar is a plain `<div>`, never `position: relative`.**
 *   A positioned card would become the `offsetParent` itself and the old
 *   predicate would answer correctly — the fixture would pass either way and
 *   prove nothing.
 * - **The card carries its own `data-geo="container"`, and the spacer carries
 *   no `data-geo` at all.** `__measure` prefers the INNERMOST container, so
 *   `noClip`/`noOverlap` are judged against the card the bar actually lives in
 *   rather than against the harness wrapper the strip legitimately overruns —
 *   which would otherwise fail for an honest reason that has nothing to do
 *   with the bar.
 *
 * `align` is the whole difference between the two fixtures below; see them for
 * why the `"end"` direction is not redundant.
 */
function StripBarFixture({ align }: { align: AdaptiveBarAlign }): ReactElement {
  const hostRef = useTriggerGeoSlot();
  return (
    <Scroll axis="x">
      {/* Sized to the sum of its children so the flex row has zero free space
          to distribute and zero deficit to recover — no shrinking, either way. */}
      <div style={{ width: STRIP_SPACER_PX + STRIP_CARD_PX }}>
        <Stack direction="row" gap="none" align="center">
          {/* No `data-geo`: the spacer is scenery, not a measured participant. */}
          <div style={{ width: STRIP_SPACER_PX }}>
            <Text variant="caption" tone="muted">
              spacer — the bar starts {STRIP_SPACER_PX}px right of the box a
              positioned-ancestor guard would compare it against
            </Text>
          </div>
          <div data-geo="container" style={{ width: STRIP_CARD_PX }}>
            <Line ref={hostRef} className="w-full">
              <AdaptiveBar gap="xs" align={align} label="Strip actions">
                <AdaptiveBar.Item id="search">
                  <span data-geo="search">
                    <IconButton
                      icon={MdSearch}
                      label="Search"
                      onClick={() => {}}
                    />
                  </span>
                </AdaptiveBar.Item>
                <AdaptiveBar.Item id="share">
                  <span data-geo="share">
                    <IconButton
                      icon={MdShare}
                      label="Share"
                      onClick={() => {}}
                    />
                  </span>
                </AdaptiveBar.Item>
                <AdaptiveBar.Item id="settings">
                  <span data-geo="settings">
                    <IconButton
                      icon={MdSettings}
                      label="Settings"
                      onClick={() => {}}
                    />
                  </span>
                </AdaptiveBar.Item>
              </AdaptiveBar>
            </Line>
          </div>
        </Stack>
      </div>
    </Scroll>
  );
}

export const adaptiveBarFixtures: LayoutFixture[] = [
  {
    // The load-bearing one: a draggable `role="slider"` and a two-rung volume
    // control sharing a row with three plain actions, swept from roomy to
    // cramped. Nothing here is an action, an action-shaped thing, or a menu row.
    id: "adaptive-bar/rich-widgets",
    primitive: "adaptive-bar",
    dims: { contentLen: "long", withMeta: true, state: "idle" },
    widths: [720, 560, 440, 320, 220],
    render: () => <RichBarFixture />,
    invariants: [{ kind: "noOverlap" }, { kind: "noClip" }],
  },
  {
    // The ordinary case a pane header actually is: every occupant an
    // `IconButton`, so every one of them declares the `"row"` rung and the panel
    // fills with labelled rows.
    id: "adaptive-bar/actions-only",
    primitive: "adaptive-bar",
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: [400, 300, 200, 120, 60],
    render: () => <ActionsBarFixture />,
    invariants: [{ kind: "noOverlap" }, { kind: "noClip" }],
  },
  {
    // The width ledger's axiom, measured. The only fixture whose occupants CAN
    // be squeezed (a truncating `<Text>` leaf, min-content ≈ 0), so the only one
    // that can tell whether the row's `[&>*]:shrink-0` is doing anything.
    //
    // The widths are chosen so every slot is inline at more than one of them
    // with a DIFFERENT number of neighbours — a slot present at only one width
    // satisfies `rigidIntegrity` trivially, and the whole question is whether
    // the neighbours change the answer.
    id: "adaptive-bar/squeezable-occupants",
    primitive: "adaptive-bar",
    dims: { contentLen: "long", withMeta: false, state: "idle" },
    widths: [880, 700, 520, 340],
    render: () => <SqueezableBarFixture />,
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      ...SQUEEZABLE_IDS.map(
        (slot) => ({ kind: "rigidIntegrity", slot }) as const,
      ),
      // And the proof that the assertion above bites. `shrinkSlots` hands the
      // measured boxes back to the engine — `flex: 0 1 auto` + `min-width: 0`,
      // what an ordinary flex item is — which is precisely the state this whole
      // change removed: the occupants absorb the row's deficit, their widths
      // become a function of the placement, and `rigidIntegrity` must fail.
      //
      // Without it this would be the one invariant in the catalog with nothing
      // to say it is not vacuous, and a fixture whose labels turned out short
      // enough never to crowd its row would pass forever while proving nothing.
      {
        kind: "falsification",
        mutate: { kind: "shrinkSlots" },
        expectViolated: { kind: "rigidIntegrity", slot: "alpha" },
      },
    ],
  },
  {
    // The regression fixture for the guard that took the Layout Lab down: a bar
    // whose own row is roomy, parked far from its nearest positioned ancestor.
    //
    // The width sweep is deliberately inert for the bar — the strip and the
    // card are authored, so widening the harness only widens the SCROLL
    // VIEWPORT the strip overruns. That is itself the assertion: the bar's
    // geometry must depend on the box it was given and on nothing else, and the
    // narrower harness width is the harsher case (the offset relative to the
    // positioned ancestor is larger, not smaller).
    //
    // `rigidIntegrity` is here for a reason the other two invariants cannot
    // cover, and it is the load-bearing one rather than a belt-and-braces
    // extra. `noOverlap` and `noClip` both skip a slot that is absent, and once
    // a fault is terminal this bug PRESENTS as every occupant floored into the
    // panel and gone from the row — geometrically serene, and completely wrong.
    // The measurer page is a Vite PRODUCTION build, so the bar's dev-only throw
    // is compiled out and the page-error drain never hears about it; the quiet
    // branch is the only branch the gate can see. `rigidIntegrity` fails on a
    // slot that is never present across the sweep, so "the three actions are
    // still in the row, at the same width" is asserted rather than assumed.
    id: "adaptive-bar/inside-horizontal-strip",
    primitive: "adaptive-bar",
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: [720, 320],
    render: () => <StripBarFixture align="start" />,
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      { kind: "rigidIntegrity", slot: "search" },
      { kind: "rigidIntegrity", slot: "share" },
      { kind: "rigidIntegrity", slot: "settings" },
    ],
  },
  {
    // The same shape with `align="end"`, and it is not redundant with the one
    // above — it is the direction a right-edge-only guard cannot see at all.
    //
    // `align="end"` packs the occupants against the far edge, so an over-full
    // row spills to the LEFT, and LTR scrollable overflow does not account for
    // content past the left edge: `root.scrollWidth` reads exactly equal to
    // `clientWidth` on a row overflowing that way (measured in Chromium, not
    // assumed). Any guard phrased as "does the content stick out to the right"
    // is blind here — and this is not an exotic configuration, it is what every
    // pane header in the app renders. So the guard is exercised in this
    // direction too, on the same strip shape, rather than leaving it to the
    // synthetic spans in the primitive's own unit tests.
    id: "adaptive-bar/inside-horizontal-strip-end",
    primitive: "adaptive-bar",
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: [720, 320],
    render: () => <StripBarFixture align="end" />,
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      { kind: "rigidIntegrity", slot: "search" },
      { kind: "rigidIntegrity", slot: "share" },
      { kind: "rigidIntegrity", slot: "settings" },
    ],
  },
];
