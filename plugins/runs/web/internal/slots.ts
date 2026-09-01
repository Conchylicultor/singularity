import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { OpenPaneFn } from "@plugins/primitives/plugins/pane/web";
import type { UnionRun } from "../../core";
import { GenericRunLeading } from "../components/generic-run-leading";

/** The props every per-kind row affordance receives: the merged row itself. */
export interface RunRowProps {
  run: UnionRun;
}

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
 * **The row body is not one of them, deliberately.** There used to be a
 * `Runs.Row` an arm could replace the whole line with, and it cost the surface
 * its schema: the list installs a `renderRow` override the moment ANY arm
 * contributes one, and that override replaces the field-driven body for EVERY
 * kind — so one arm's bespoke row silently switched off the Properties panel for
 * all four. What an arm wanted it for was never really a row, either: it was a
 * detail surface it did not have yet (backup's expand/collapse card) or a set of
 * chips its own fields already described (deploy's).
 *
 * So a row is fields, and only fields. A domain's detail belongs in the pane its
 * `Kind.open` pushes; a domain's columns belong in `Fields`, where they are also
 * filterable, sortable and groupable rather than merely visible.
 */
export const Runs = {
  /** One per arm: the kind's label, and optionally how to open one of its rows. */
  Kind: defineSlot<RunKindContribution>(),
  /**
   * The list-row leading indicator for one kind. Falls back to the outcome dot.
   *
   * The one presentational seam that survives, because it is a fixed-size glyph
   * in a slot the list already owns — it cannot grow to swallow the row.
   */
  Leading: defineDispatchSlot<RunRowProps, string>({
    key: (p) => p.run.kind,
    fallback: GenericRunLeading,
  }),
  /** Where an arm contributes its own `FieldDef`s — the standard data-view seam. */
  Fields: defineFieldExtensions<UnionRun>(),
};
