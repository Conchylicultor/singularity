import { useCallback, useMemo, type ReactNode } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  type DataViewDensity,
} from "@plugins/primitives/plugins/data-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { queryRuns, runRowKey, runsRevisionResource } from "../../core";
import type { UnionRun } from "../../core";
import { useRunFields } from "../internal/fields";
import { Runs } from "../internal/slots";
import { RUNS_VIEW } from "../internal/view-id";

export interface RunsDataViewProps {
  /** How much room the host gives it — a popover declares `"compact"`. */
  density?: DataViewDensity;
  /** Restrict + order the view children. Defaults to list then table. */
  views?: string[];
  defaultView?: string;
  /**
   * Override the empty line. Rarely needed: the default already distinguishes
   * an empty LEDGER from a view that matches nothing, which is the distinction
   * a host would otherwise be overriding to get.
   */
  emptyState?: ReactNode;
  /**
   * Highlight the row whose detail surface is open.
   *
   * The PAIR, never a bare domain id: a run id is unique only within its own
   * ledger, so `{ kind: "build", id }` is what names a row here. A host holding a
   * build run id therefore cannot pass it by accident and get silence — the type
   * makes it say which ledger it means.
   */
  selectedRun?: { kind: string; id: string };
  /**
   * Fires when a row is clicked, IN ADDITION to the arm's own
   * `Runs.Kind.open` — never instead of it.
   *
   * The arm still owns where the click goes; this is for the host's own business
   * with its own chrome (the build popover closing itself, so it does not hang
   * over the pane the click just opened). It runs after the arm's opener.
   */
  onRowActivate?: (run: UnionRun) => void;
  /**
   * Show exactly this view instance, and paint no switcher.
   *
   * Without it, every host of this surface shares one device-local active
   * instance — which is right for the hosts that ARE tab strips over the runs
   * space (the build popover and `/debug/build` deliberately move together), and
   * wrong for a host that is one scoped list inside another app. A pinned host
   * reads its instance and never writes the shared selection.
   */
  pinnedView?: string;
}

/**
 * **Runs** — every long-running operation on this machine, from every ledger, in
 * one list.
 *
 * One ordinary `<DataView>` whose row space is a discriminated union: the rows
 * arrive already merged from `POST /api/runs/query`, so the host needs to know
 * nothing about arms. Filter, sort, group-by and search all compile to SQL
 * across every ledger at once, and pagination is keyset — infinite scroll walks
 * across arm boundaries without duplicating or dropping a row.
 *
 * The same component at every density: a build popover and a full debug pane are
 * the same surface asking for different room.
 */
export function RunsDataView({
  density,
  views = ["list", "table"],
  defaultView = "list",
  emptyState,
  selectedRun,
  onRowActivate,
  pinnedView,
}: RunsDataViewProps): ReactNode {
  // The tick drives an in-place refetch of the loaded window; the keyset query
  // is the source of truth. While pending, hand a null tick (no refetch) — the
  // first settled `rev` then refreshes once.
  const tick = useResource(runsRevisionResource);
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  // "Nothing has run" is a claim about the LEDGER, and the loaded page cannot
  // make it: every tab here is a filter, and the default one (Active) is empty
  // whenever nothing happens to be in flight. A machine with three thousand
  // recorded runs opening the build button must not be told nothing ever ran.
  //
  // The tick carries `hasRuns` for exactly this. While it is pending the
  // narrower sentence is used — it is true of an empty ledger too, so the strong
  // claim is only ever made once it is known to be true, and there is no loading
  // state to render for a line of copy.
  const everRan = matchResource(tick, {
    pending: () => true,
    ready: (d) => d.hasRuns,
  });

  const openPane = useOpenPane();
  const kinds = Runs.Kind.useContributions();
  const rowRenderers = Runs.Row.useContributions();
  const fields = useRunFields(kinds);

  const openers = useMemo(
    () =>
      new Map(
        kinds.flatMap((k) => (k.open ? [[k.kind, k.open] as const] : [])),
      ),
    [kinds],
  );

  const viewOptions = useMemo(
    () => ({
      list: {
        leading: (run: UnionRun) => <Runs.Leading.Dispatch run={run} />,
        // Only take over the row body when an arm actually has one. With no
        // contributor the list keeps its own field-driven row, which respects
        // the user's chosen visible fields; `renderRow` would override that for
        // every kind to buy nothing.
        ...(rowRenderers.length > 0
          ? { renderRow: (run: UnionRun) => <Runs.Row.Dispatch run={run} /> }
          : {}),
      },
    }),
    [rowRenderers.length],
  );

  // Per row, not per surface: this list holds rows of several kinds and only
  // some of them go anywhere. A build row activates and stays a button; a backup
  // row whose arm contributes no `open` resolves to null and renders as a plain
  // container — which is what lets its body hold a real control instead of
  // nesting a <button> inside the row's own.
  //
  // Two independent reasons a click matters (the arm's navigation and the host's
  // own side effect), so a row activates if EITHER is present and runs both when
  // both are.
  const resolveActivation = useCallback(
    (run: UnionRun): (() => void) | undefined => {
      const open = openers.get(run.kind);
      if (!open && !onRowActivate) return undefined;
      return () => {
        open?.(run, { openPane });
        onRowActivate?.(run);
      };
    },
    [openers, onRowActivate, openPane],
  );

  return (
    <DataView<UnionRun>
      storageKey={RUNS_VIEW}
      rows={[]}
      fields={fields}
      fieldExtensions={Runs.Fields}
      rowKey={runRowKey}
      views={views}
      defaultView={defaultView}
      pinnedView={pinnedView}
      density={density}
      viewOptions={viewOptions}
      emptyState={
        emptyState ??
        (everRan ? (
          <>No runs match this view.</>
        ) : (
          <>Nothing has run on this machine yet.</>
        ))
      }
      selectedRowId={selectedRun ? runRowKey(selectedRun) : undefined}
      rowActivation={resolveActivation}
      dataSource={{
        changeTick,
        fetchPage: (args) => fetchEndpoint(queryRuns, {}, { body: args }),
      }}
    />
  );
}
