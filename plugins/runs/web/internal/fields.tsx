import { useMemo, type ReactNode } from "react";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  RUN_OUTCOME_OPTIONS,
  RunOutcomeChip,
} from "@plugins/runs/plugins/run-outcome/web";
import type { UnionRun } from "../../core";
import { formatDuration } from "./format";
import type { RunKindContribution } from "./slots";

function muted(text: string | null): ReactNode {
  return text === null ? null : (
    <span className="text-muted-foreground">{text}</span>
  );
}

/**
 * The base field schema — one entry per base column, and nothing else.
 *
 * Every one of these is a real projected column, so every `sortable` /
 * `filterable` flag here compiles to SQL on the server. Nothing is derived from
 * the loaded rows: the window is server-paginated, so a derived option list
 * would offer only what happens to be on screen.
 *
 * `kind` is the exception that proves it — its options come from the registered
 * arms (a build kind is a fact about what is installed, not about this page),
 * which is why the schema is a hook rather than a constant.
 */
export function useRunFields(
  kinds: readonly RunKindContribution[],
): FieldDef<UnionRun>[] {
  return useMemo(() => {
    const kindOptions = kinds.map((k) => ({ value: k.kind, label: k.label }));
    return [
      {
        id: "label",
        label: "Run",
        type: "text",
        value: (r) => r.label,
        primary: true,
        sortable: true,
        filterable: true,
        width: "minmax(0,1fr)",
      },
      {
        id: "kind",
        label: "Kind",
        type: "enum",
        value: (r) => r.kind,
        options: kindOptions,
        cell: (r) => <Badge variant="muted">{r.kind}</Badge>,
        sortable: true,
        filterable: true,
        groupable: true,
        width: "8rem",
      },
      {
        id: "outcome",
        label: "Outcome",
        type: "enum",
        value: (r) => r.outcome,
        options: RUN_OUTCOME_OPTIONS,
        cell: (r) => <RunOutcomeChip outcome={r.outcome} />,
        sortable: true,
        filterable: true,
        groupable: true,
        width: "10rem",
      },
      {
        id: "trigger",
        label: "Trigger",
        type: "text",
        value: (r) => r.trigger,
        cell: (r) => muted(r.trigger),
        sortable: true,
        filterable: true,
        width: "8rem",
      },
      {
        id: "namespace",
        label: "Namespace",
        type: "text",
        value: (r) => r.namespace,
        cell: (r) =>
          r.namespace === null ? null : (
            <Badge variant="muted" mono title={r.namespace}>
              {r.namespace}
            </Badge>
          ),
        sortable: true,
        filterable: true,
        width: "10rem",
      },
      {
        id: "duration",
        label: "Took",
        type: "number",
        value: (r) => r.duration,
        // Sortable and filterable BECAUSE it is a real projected column, derived
        // in SQL rather than in the cell — so "the ten slowest runs" is a sort,
        // not a thing you can only eyeball on the loaded page.
        cell: (r) => muted(formatDuration(r.duration)),
        sortable: true,
        filterable: true,
        width: "6rem",
      },
      {
        id: "startedAt",
        label: "Started",
        type: "date",
        value: (r) => r.startedAt,
        cell: (r) => (
          <span className="text-muted-foreground">
            <RelativeTime date={r.startedAt} />
          </span>
        ),
        sortable: true,
        filterable: true,
        width: "8rem",
      },
      {
        id: "finishedAt",
        label: "Finished",
        type: "date",
        value: (r) => r.finishedAt,
        cell: (r) =>
          r.finishedAt === null ? null : (
            <span className="text-muted-foreground">
              <RelativeTime date={r.finishedAt} />
            </span>
          ),
        sortable: true,
        filterable: true,
        // Off by default: `Started` plus `Took` already say when and how long,
        // and a third time column earns its place only when asked for.
        visible: false,
        width: "8rem",
      },
      {
        id: "message",
        label: "Message",
        type: "text",
        value: (r) => r.message,
        // No `cell` of its own, deliberately. The one it used to carry rendered
        // `whitespace-pre-wrap`, which is the single thing in this schema that
        // can break a row's line: the list's one-line shape is a `region-line`
        // context where every leaf ellipsizes without asking, and a cell that
        // overrides `white-space` opts back out of it. The shared `TextCell`
        // truncates, which is what a row wants.
        //
        // Off by default, like `finishedAt`. This is the only prose in a schema
        // of badges and scalars, it is non-null on just two of the four arms
        // (build and backup both project null — a build's words live in its
        // transcript, a backup's are per-target), and the failure is already
        // stated by `outcome` and, more precisely, by `deploy.phaseFailed` /
        // `build.status` / the exit codes. Where the verbatim text matters it is
        // one click away in the run's own detail surface.
        //
        // `filterable` stays, and `RUN_SEARCH_COLUMNS` already lists `message`,
        // so searching for a failure's own words is unaffected by the default.
        filterable: true,
        visible: false,
        width: "24rem",
      },
    ] satisfies FieldDef<UnionRun>[];
  }, [kinds]);
}
