import { useEffect, useState, type ReactElement } from "react";
import {
  loadFixtures,
  isLayoutFixture,
  isRegionFixture,
  type HarnessFixture,
  type LayoutFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import type { PrototypeStageProps } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { MockFrame } from "./mock-frame";

/**
 * Widths to offer when the matched fixture declares none of its own. A fixture's
 * `widths` array is the component's own statement of where it changes shape, so
 * it is always preferred; this is only the floor under an empty one.
 */
const FALLBACK_WIDTHS = [360, 640, 960] as const;

/**
 * The width list, typed as what it is: never empty. `LayoutFixture.widths` is a
 * plain `number[]`, so an empty one is representable there — {@link widthChoices}
 * is the one place that possibility is resolved, and everything downstream can
 * then read `widths[0]` as a plain number with no cast and no `!`.
 */
type WidthChoices = readonly [number, ...number[]];

/** The fixture's own widths, or the fallback when it declares none. */
function widthChoices(fixture: LayoutFixture): WidthChoices {
  const [first, ...rest] = fixture.widths;
  return first === undefined ? FALLBACK_WIDTHS : [first, ...rest];
}

/**
 * The Component stage: the prototype mock and the real app component it says it
 * mocks, side by side, both live and both at ONE width the reader changes.
 *
 * The pairing is declarative and one-directional — the prototype names a
 * layout-harness fixture id in its own `<meta name="mocks">`, and this stage
 * looks it up. Prototypes are host-global and outside git while the fixture
 * catalog is per-worktree, so the lookup can only ever happen at runtime and
 * "this worktree has no such fixture" is an ordinary answer, not a fault.
 */
export function ComponentStage({
  meta,
  version,
}: PrototypeStageProps): ReactElement {
  // The catalog, or "not loaded yet". Loaded exactly like the Layout Lab loads
  // it — once, in an effect, no polling; the generated registry's entries are
  // dynamic imports, so the fixtures are code-split off this pane's own wave.
  const [catalog, setCatalog] = useState<HarnessFixture[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadFixtures().then((loaded) => {
      if (alive) setCatalog(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Asked before the catalog: a prototype that names nothing needs no lookup,
  // and this answer never changes once the metadata is in hand.
  if (meta.mocks === "") return <NoCounterpart />;

  // Named something, and we do not know yet whether it exists. The empty
  // "declares no counterpart" copy would be a claim about this prototype that
  // then reverses itself, so it is a loading state instead.
  if (catalog === null) {
    return (
      <Inset pad="lg">
        <Loading label="Loading the component catalog…" />
      </Inset>
    );
  }

  const entry = catalog.find((f) => f.id === meta.mocks) ?? null;
  if (entry === null || !isLayoutFixture(entry)) {
    return <Unresolved id={meta.mocks} entry={entry} />;
  }

  return <SideBySide fixture={entry} meta={meta} version={version} />;
}

/**
 * Both halves, at one width.
 *
 * Shared width IS the comparison affordance: one control moves both, so the
 * reader is always asking "at this width, do these agree?" rather than trading
 * room between the two — which a draggable divider would do, and which would
 * make every reading a different question.
 */
function SideBySide({
  fixture,
  meta,
  version,
}: {
  fixture: LayoutFixture;
  meta: PrototypeMeta;
  version: number;
}): ReactElement {
  const widths = widthChoices(fixture);

  // The width, not the index: a picked width survives the fixture changing under
  // it (the reader opens another prototype in the same pane), and one the new
  // fixture does not offer falls back rather than leaving the halves at a width
  // nothing declares.
  const [picked, setPicked] = useState<number | null>(null);
  const width =
    picked !== null && widths.includes(picked)
      ? picked
      : defaultWidth(widths, meta);

  return (
    <Column
      className="h-full"
      header={
        <Bar tier="pane">
          <Stack direction="row" gap="sm" align="center">
            <Text variant="label">Width</Text>
            <SegmentedControl<string>
              options={widths.map((w) => ({
                id: String(w),
                label: `${String(w)}px`,
              }))}
              value={String(width)}
              onChange={(id) => setPicked(Number(id))}
            />
            {/* The id is an identifier, which is what Badge's `mono` is for. */}
            <Badge mono>{fixture.id}</Badge>
          </Stack>
        </Bar>
      }
      body={
        // `h-full`, not `fill`: `scrollBody={false}` wraps the body in a plain
        // BLOCK div, so `fill`'s `min-h-0 flex-1` would be inert there and the
        // overflow would never engage. That div is itself a flex child with a
        // resolved height, so 100% of it is a real height to scroll inside.
        // Column's own managed body is not an option — it scrolls y only, and
        // two fixed-width halves in a row need x.
        <Scroll axis="both" className="h-full">
          <Inset pad="lg">
            <Stack direction="row" gap="lg" align="start">
              <Half title="Prototype mock" subtitle={meta.title} width={width}>
                {/* The prototype's declared viewport height: the frame is as tall
                    as the mock says it means to be, and as wide as the stage says. */}
                <MockFrame
                  meta={meta}
                  version={version}
                  height={meta.viewport.h}
                />
              </Half>
              <Half
                title="App component"
                subtitle={dimsLabel(fixture)}
                width={width}
              >
                {/*
                  One crashing fixture must cost its own half, not the pane. The
                  stage renders an arbitrary contributed component from an
                  arbitrary plugin — exactly the Layout Lab's situation — and the
                  slot middleware's boundary is the whole pane, which would take
                  the mock down with it and leave nothing to compare against.
                */}
                <PluginErrorBoundary
                  slot="prototype-compare-component"
                  label={`${fixture.id} @ ${String(width)}px`}
                >
                  {fixture.render()}
                </PluginErrorBoundary>
              </Half>
            </Stack>
          </Inset>
        </Scroll>
      }
      scrollBody={false}
    />
  );
}

/** One labelled half, sized to the shared width. */
function Half({
  title,
  subtitle,
  width,
  children,
}: {
  title: string;
  subtitle: string;
  width: number;
  children: ReactElement;
}): ReactElement {
  return (
    <Stack gap="2xs">
      <Stack direction="row" gap="sm" align="baseline" wrap>
        <Text variant="label">{title}</Text>
        <Text variant="caption" tone="muted">
          {subtitle}
        </Text>
      </Stack>
      {/* Fixed-px width is the point here — both halves are handed the SAME box,
          which is the only way the two renderings are comparable at all. */}
      <Card style={{ width }}>{children}</Card>
    </Stack>
  );
}

/**
 * The width to start at: whichever the fixture declares that is closest to the
 * prototype's own declared viewport width.
 *
 * The mock was drawn at that width, so it is the one width the mock is certain
 * to have something to say about — and the fixture's own list is where the
 * component's meaningful breakpoints are stated. Ties go to the narrower.
 */
function defaultWidth(widths: WidthChoices, meta: PrototypeMeta): number {
  let best = widths[0];
  for (const w of widths) {
    if (Math.abs(w - meta.viewport.w) < Math.abs(best - meta.viewport.w)) {
      best = w;
    }
  }
  return best;
}

function dimsLabel(f: LayoutFixture): string {
  const { contentLen, withMeta, state } = f.dims;
  return `${contentLen}${withMeta ? " · meta" : ""} · ${state}`;
}

/**
 * This prototype names no counterpart — the ordinary case, since most
 * prototypes are not a mockup of an app component. So the copy is about how to
 * add one rather than about something being wrong.
 */
function NoCounterpart(): ReactElement {
  return (
    <Inset pad="lg">
      <Stack gap="sm">
        <Text variant="body">
          This prototype does not say which app component it mocks.
        </Text>
        <Text variant="body" tone="muted">
          Add one line to its <Badge mono>index.html</Badge>, naming a
          layout-harness fixture id:
        </Text>
        <Text as="div" variant="code">
          {'<meta name="mocks" content="control-panel/setting-rail" />'}
        </Text>
        <Text variant="caption" tone="muted">
          The ids are the fixtures listed in Debug → Layout Lab. Saving the file
          reloads this pane.
        </Text>
      </Stack>
    </Inset>
  );
}

/**
 * The prototype named a fixture this worktree cannot render. Two ways that
 * happens, and they are different enough to be worth separate sentences:
 * nothing has that id here, or it is a REGION fixture — which hands the harness
 * a hole and takes the children the harness supplies, so it has no rendering of
 * its own to put beside a mock.
 */
function Unresolved({
  id,
  entry,
}: {
  id: string;
  entry: HarnessFixture | null;
}): ReactElement {
  const region = entry !== null && isRegionFixture(entry);
  return (
    <Inset pad="lg">
      <Stack gap="sm">
        <Text variant="body">
          This prototype mocks <Badge mono>{id}</Badge>
          {region
            ? ", which opens a region rather than rendering a component."
            : ", which this worktree has no fixture for."}
        </Text>
        <Text variant="body" tone="muted">
          {region
            ? "A region fixture leaves a hole the harness fills with its own children, so there is nothing here to render on its own. See it in Debug → Layout Lab, which supplies those children."
            : "Prototypes live outside the repo and are shared by every worktree, while fixtures are per-worktree code — so a prototype can name a fixture that only exists on another branch. Check the id against Debug → Layout Lab."}
        </Text>
      </Stack>
    </Inset>
  );
}
