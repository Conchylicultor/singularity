import type { ReactElement } from "react";
import {
  ExhibitView,
  useExhibit,
  type ExhibitResult,
} from "@plugins/plugin-meta/plugins/exhibits/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type {
  CounterpartKindProps,
  CounterpartResolution,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/**
 * The `exhibit:` kind: one real app component, looked up by id in the exhibit
 * catalog and rendered inside this app's own React tree — so an app exhibit's
 * slot contributions, config and data are the real ones, and an isolated one
 * renders exactly as it does anywhere else.
 */
export function ExhibitCounterpart({
  target,
  children,
}: CounterpartKindProps): ReactElement {
  const lookup = useExhibit(target);
  return <>{children(resolve(target, lookup))}</>;
}

function resolve(id: string, lookup: ExhibitResult): CounterpartResolution {
  switch (lookup.kind) {
    // The catalog loads once per page. Until it has, "no such exhibit" would
    // be a claim about this prototype that then reverses itself.
    case "loading":
      return { status: "loading", label: "Loading the exhibit catalog…" };
    case "missing":
      return {
        status: "unresolved",
        title: (
          <>
            This prototype mocks <Badge mono>{id}</Badge>, which no plugin in
            this worktree exhibits.
          </>
        ),
        detail:
          "Prototypes live outside the repo and are shared by every worktree, while exhibits are per-branch code — so a prototype can name one that only exists on another branch. A plugin exhibits a component from its own exhibits/ folder, under that id.",
      };
    case "ambiguous":
      return {
        status: "unresolved",
        title: (
          <>
            Several exhibits claim <Badge mono>{id}</Badge>.
          </>
        ),
        detail: `Exhibit ids must be unique; ${String(lookup.exhibits.length)} exhibits use this one (${lookup.exhibits.map((e) => e.label).join(", ")}). Rename all but one.`,
      };
    case "found": {
      const { exhibit } = lookup;
      return {
        status: "found",
        title: exhibit.label,
        ...(exhibit.description === undefined
          ? {}
          : { subtitle: exhibit.description }),
        badge: exhibit.id,
        // The frame is already the canvas's size, so no width is forced here;
        // ExhibitView brings the exhibit's own error boundary.
        render: () => <ExhibitView exhibit={exhibit} />,
      };
    }
  }
}
