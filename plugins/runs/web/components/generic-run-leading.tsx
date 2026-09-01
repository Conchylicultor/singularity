import type { ReactNode } from "react";
import { RunOutcomeDot } from "@plugins/runs/plugins/run-outcome/web";
import type { RunRowProps } from "../internal/slots";

/**
 * The leading indicator for a kind that contributes none: the shared outcome
 * dot. Always present, because "is this still going" is the first thing anyone
 * reads off the list and no kind has a better answer than the shared one.
 *
 * A kind whose own vocabulary draws a distinction the shared one collapses
 * contributes its own — build's six-way status dot separates `superseded` /
 * `interrupted` / `killed`, which `outcome` folds into one `canceled`.
 */
export function GenericRunLeading({ run }: RunRowProps): ReactNode {
  return <RunOutcomeDot outcome={run.outcome} />;
}
