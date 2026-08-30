import type { ReactNode } from "react";
import { BuildStatusDot } from "@plugins/build/plugins/build-status/web";
import type { RunRowProps } from "@plugins/runs/web";
import { buildOutcomeOf } from "../internal/outcome";

/**
 * The leading indicator on a build row.
 *
 * The shared outcome dot would say `canceled` in one muted grey for a
 * superseded, an interrupted and an externally-killed build alike. The build
 * dot already draws exactly the distinction that matters in a list — red only
 * for the one status a person must act on — so the arm contributes it and the
 * list row reads the same as it does on the build pane.
 */
export function BuildRunLeading({ run }: RunRowProps): ReactNode {
  return <BuildStatusDot run={buildOutcomeOf(run)} />;
}
