import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { OpenPaneFn } from "@plugins/primitives/plugins/pane/web";
import type { UnionRun } from "../../core";
import {
  GenericRunLeading,
  GenericRunRow,
  type RunRowProps,
} from "../components/generic-run-row";

/**
 * What an arm registers on the web: its label, and — optionally — where a row of
 * that kind goes when it is clicked.
 *
 * The label cannot come from the server registry: the `kind` filter chip has to
 * offer every kind, including the ones with no row on the current page, so its
 * options are derived from the registered kinds rather than from the loaded
 * window. This is that registration.
 *
 * `open` receives the caller's own `openPane`, so the arm navigates from the
 * surface the row is rendered in rather than always at the root. An arm with no
 * detail surface omits it, and its rows simply do not activate — which is the
 * honest behaviour, not a click that quietly does nothing.
 */
export interface RunKindContribution {
  kind: string;
  label: string;
  open?: (run: UnionRun, ctx: { openPane: OpenPaneFn }) => void;
}

/**
 * The seams an arm reaches the merged surface through.
 *
 * Presentation is dispatched, schema is not — that split is load-bearing.
 * Fields are what make filter / sort / group-by / search mean one thing across
 * kinds, so the table view stays strictly field-driven and an arm's field is
 * simply blank on other kinds' rows. Only the *list row* and its leading
 * indicator are the arm's to replace, because those are where a domain's own
 * shorthand belongs.
 */
export const Runs = {
  /** One per arm: the kind's label, and optionally how to open one of its rows. */
  Kind: defineSlot<RunKindContribution>(),
  /** The list-row body for one kind. Falls back to the base-column row. */
  Row: defineDispatchSlot<RunRowProps, string>({
    key: (p) => p.run.kind,
    fallback: GenericRunRow,
  }),
  /** The list-row leading indicator for one kind. Falls back to the outcome dot. */
  Leading: defineDispatchSlot<RunRowProps, string>({
    key: (p) => p.run.kind,
    fallback: GenericRunLeading,
  }),
  /** Where an arm contributes its own `FieldDef`s — the standard data-view seam. */
  Fields: defineFieldExtensions<UnionRun>(),
};
