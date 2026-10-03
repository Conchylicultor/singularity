/**
 * The merged run surface over the `runs` union window (step 12c of
 * research/2026-10-01-global-scoped-change-routing-p5-p8-v2.md):
 *
 * - `<RunDuration>` — a finished run reads its server `duration`; a running
 *   one (NULL duration) ticks its elapsed time off the browser clock, once a
 *   second, with the same formatter;
 * - the base field schema resolves against the live source exactly as the
 *   DataView resolves it at mount: every base field binds its union column,
 *   a field marked sortable sorts in SQL, every filterable one filters in its
 *   column's domain — so the surface cannot throw on its own schema;
 * - `<RunsDataView>`'s own wiring, mounted over a stubbed DataView (how rows
 *   draw is the primitive's tested behaviour): the host's empty line reaches
 *   it, a selected `{ kind, id }` highlights its row key, and activation is per
 *   kind — a kind with no `open` does not activate, unless the host asked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import {
  liveDataSource,
  type FilterOperatorSet,
} from "@plugins/primitives/plugins/data-view/web";
import { resolveLiveFields } from "@plugins/primitives/plugins/data-view/web/testing";
import { runRowKey, runs, type RunRow } from "../../core";
import { RunDuration } from "../components/run-duration";
import { RunsDataView } from "../components/runs-data-view";
import { useRunFields } from "../internal/fields";
import type { RunKindContribution } from "../internal/slots";

/** What the stubbed seams hold for the `<RunsDataView>` suite. */
const stub = vi.hoisted(() => ({
  /** The props the stubbed DataView last rendered with. */
  props: undefined as Record<string, unknown> | undefined,
  /** The registered kinds `Runs.Kind` answers. */
  kinds: [] as unknown[],
  openPane: () => {},
}));

vi.mock(
  "@plugins/primitives/plugins/data-view/web",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    DataView: (props: Record<string, unknown>) => {
      stub.props = props;
      return null;
    },
  }),
);

vi.mock("@plugins/primitives/plugins/pane/web", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOpenPane: () => stub.openPane,
}));

vi.mock("../internal/slots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../internal/slots")>();
  return {
    ...actual,
    Runs: {
      ...actual.Runs,
      Kind: { ...actual.Runs.Kind, useContributions: () => stub.kinds },
    },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = new Date("2026-10-02T12:00:00Z");

describe("<RunDuration>", () => {
  it("a finished run reads its duration", () => {
    render(
      <RunDuration
        run={{
          startedAt: new Date(NOW.getTime() - 100_000),
          finishedAt: NOW,
          duration: 100_000,
        }}
      />,
    );
    expect(screen.getByText("1m 40s")).not.toBeNull();
  });

  it("a running run ticks its elapsed time once a second", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    render(
      <RunDuration
        run={{
          startedAt: new Date(NOW.getTime() - 90_000),
          finishedAt: null,
          duration: null,
        }}
      />,
    );
    expect(screen.getByText("1m 30s")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("1m 32s")).not.toBeNull();
  });
});

/** Operator sets reduced to what field resolution reads: each type's domain. */
const DOMAINS: Record<string, FilterOperatorSet["domain"]> = {
  text: "text",
  enum: "text",
  number: "number",
  date: "instant",
};
const resolveOperatorSet = (type: string): FilterOperatorSet | undefined =>
  DOMAINS[type] === undefined
    ? undefined
    : { match: type, domain: DOMAINS[type]!, operators: [] };

describe("the base field schema over the runs source", () => {
  it("resolves at mount: every field binds a union column, sorts and filters as declared", () => {
    const source = liveDataSource(runs, {
      searchable: ["label", "message", "namespace", "trigger"],
    });
    const { result } = renderHook(() =>
      useRunFields([{ kind: "build", label: "Build" }]),
    );
    const plan = resolveLiveFields<RunRow>(
      result.current,
      source,
      resolveOperatorSet,
      "runs",
    );
    expect([...plan.columnOf.keys()].sort()).toEqual(
      [
        "duration",
        "finishedAt",
        "kind",
        "label",
        "message",
        "namespace",
        "outcome",
        "startedAt",
        "trigger",
      ].sort(),
    );
    expect(plan.sortFields.map((f) => f.id)).toContain("duration");
    expect(plan.filterFields.map((f) => f.id)).toContain("kind");
    // The kind chip offers the registered kinds, not the loaded page's.
    const kind = result.current.find((f) => f.id === "kind")!;
    expect(kind.options).toEqual([{ value: "build", label: "Build" }]);
  });
});

/** A merged row of `kind` — only the fields the wiring reads. */
const row = (kind: string, id: string): RunRow =>
  ({ kind, id, runKey: runRowKey({ kind, id }) }) as unknown as RunRow;

/** The stubbed DataView's `rowActivation`, as the primitive calls it. */
function activationOf(run: RunRow): (() => void) | undefined {
  const resolve = stub.props!.rowActivation as (
    r: RunRow,
  ) => (() => void) | undefined;
  return resolve(run);
}

describe("<RunsDataView>", () => {
  const openBuild = vi.fn<NonNullable<RunKindContribution["open"]>>();

  beforeEach(() => {
    stub.props = undefined;
    openBuild.mockReset();
    stub.kinds = [
      { kind: "build", label: "Build", open: openBuild },
      { kind: "release", label: "Release" },
    ] satisfies RunKindContribution[];
  });

  it("hands the DataView the host's empty line and the live runs source", () => {
    render(<RunsDataView emptyState="No backups yet." />);
    expect(stub.props!.emptyState).toBe("No backups yet.");
    expect(stub.props!.selectedRowId).toBeUndefined();
  });

  it("highlights the selected run by its row key — the (kind, id) pair, not a bare id", () => {
    render(
      <RunsDataView
        emptyState="none"
        selectedRun={{ kind: "build", id: "b:1" }}
      />,
    );
    expect(stub.props!.selectedRowId).toBe(
      runRowKey({ kind: "build", id: "b:1" }),
    );
    expect(stub.props!.selectedRowId).toBe("build:b:1");
  });

  it("a row activates through its own kind's `open`; a kind with none does not activate", () => {
    render(<RunsDataView emptyState="none" />);
    const build = row("build", "1");
    activationOf(build)!();
    expect(openBuild).toHaveBeenCalledTimes(1);
    expect(openBuild.mock.calls[0]![0]).toBe(build);
    expect(openBuild.mock.calls[0]![1].openPane).toBe(stub.openPane);
    expect(activationOf(row("release", "1"))).toBeUndefined();
    // A kind nobody registered is no different.
    expect(activationOf(row("mystery", "1"))).toBeUndefined();
  });

  it("the host's onRowActivate runs in addition to the arm's opener, and makes every row activate", () => {
    const calls: string[] = [];
    openBuild.mockImplementation(() => calls.push("arm"));
    render(
      <RunsDataView
        emptyState="none"
        onRowActivate={(r) => calls.push(`host:${r.kind}`)}
      />,
    );
    activationOf(row("build", "1"))!();
    expect(calls).toEqual(["arm", "host:build"]);
    activationOf(row("release", "2"))!();
    expect(calls).toEqual(["arm", "host:build", "host:release"]);
  });
});
