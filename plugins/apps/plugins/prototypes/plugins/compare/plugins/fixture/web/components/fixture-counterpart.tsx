import { useEffect, useState, type ReactElement } from "react";
import {
  loadFixtures,
  isLayoutFixture,
  isRegionFixture,
  type HarnessFixture,
  type LayoutFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import type {
  CounterpartKindProps,
  WidthChoices,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * Widths to offer when the matched fixture declares none of its own. A fixture's
 * `widths` array is the component's own statement of where it changes shape, so
 * it is always preferred; this is only the floor under an empty one.
 */
const FALLBACK_WIDTHS: WidthChoices = [360, 640, 960];

/**
 * The fixture's own widths, or the fallback when it declares none.
 * `LayoutFixture.widths` is a plain `number[]`, so an empty one is
 * representable there — this is the one place that possibility is resolved.
 */
function widthChoices(fixture: LayoutFixture): WidthChoices {
  const [first, ...rest] = fixture.widths;
  return first === undefined ? FALLBACK_WIDTHS : [first, ...rest];
}

function dimsLabel(f: LayoutFixture): string {
  const { contentLen, withMeta, state } = f.dims;
  return `${contentLen}${withMeta ? " · meta" : ""} · ${state}`;
}

/**
 * The `fixture:` kind: the real app component the prototype mocks, as a
 * layout-harness fixture, looked up by id in the fixture catalog.
 *
 * Prototypes are host-global and outside git while the fixture catalog is
 * per-worktree, so the lookup can only ever happen at runtime and "this
 * worktree has no such fixture" is an ordinary answer, not a fault.
 */
export function FixtureCounterpart({
  target,
  children,
}: CounterpartKindProps): ReactElement {
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

  // Named something, and we do not know yet whether it exists. "No such
  // fixture" would be a claim about this prototype that then reverses itself,
  // so it is a loading state instead.
  if (catalog === null) {
    return (
      <>
        {children({
          status: "loading",
          label: "Loading the component catalog…",
        })}
      </>
    );
  }

  const entry = catalog.find((f) => f.id === target) ?? null;
  if (entry === null || !isLayoutFixture(entry)) {
    return <>{children(unresolved(target, entry))}</>;
  }

  return (
    <>
      {children({
        status: "found",
        widths: widthChoices(entry),
        title: "App component",
        subtitle: dimsLabel(entry),
        badge: entry.id,
        render: () => entry.render(),
      })}
    </>
  );
}

/**
 * The prototype named a fixture this worktree cannot render. Two ways that
 * happens, and they are different enough to be worth separate sentences:
 * nothing has that id here, or it is a REGION fixture — which hands the harness
 * a hole and takes the children the harness supplies, so it has no rendering of
 * its own to put beside a mock.
 */
function unresolved(
  id: string,
  entry: HarnessFixture | null,
): { status: "unresolved"; title: ReactElement; detail: string } {
  const region = entry !== null && isRegionFixture(entry);
  return {
    status: "unresolved",
    title: (
      <>
        This prototype mocks <Badge mono>{id}</Badge>
        {region
          ? ", which opens a region rather than rendering a component."
          : ", which this worktree has no fixture for."}
      </>
    ),
    detail: region
      ? "A region fixture leaves a hole the harness fills with its own children, so there is nothing here to render on its own. See it in Debug → Layout Lab, which supplies those children."
      : "Prototypes live outside the repo and are shared by every worktree, while fixtures are per-worktree code — so a prototype can name a fixture that only exists on another branch. Check the id against Debug → Layout Lab.",
  };
}
