import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { MdSearch, MdSettings, MdShare, MdVolumeUp } from "react-icons/md";
import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import {
  useActionForm,
  useHoldShrink,
} from "@plugins/primitives/plugins/action-presentation/web";
import { AdaptiveBar } from "@plugins/primitives/plugins/adaptive-bar/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
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
];
