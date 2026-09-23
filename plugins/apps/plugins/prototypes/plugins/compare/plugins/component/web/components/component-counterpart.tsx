import type { ReactElement } from "react";
import {
  Specimens,
  useSpecimen,
  type SpecimenLookup,
} from "@plugins/plugin-meta/plugins/specimens/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type {
  CounterpartKindProps,
  CounterpartResolution,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/**
 * The `component:` kind: a real app component, exhibited by the plugin that
 * owns it as a specimen, rendered inline in this app's own React tree — so its
 * slot contributions, config and data are the real ones.
 *
 * No loading arm: the registry is a slot, complete once plugins have booted,
 * which they have by the time a prototype pane renders.
 */
export function ComponentCounterpart({
  target,
  children,
}: CounterpartKindProps): ReactElement {
  const lookup = useSpecimen(target);
  return <>{children(resolve(target, lookup))}</>;
}

function resolve(id: string, lookup: SpecimenLookup): CounterpartResolution {
  switch (lookup.kind) {
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
          "Prototypes live outside the repo and are shared by every worktree, while specimens are per-worktree code — so a prototype can name one that only exists on another branch. A plugin exhibits a component by contributing Specimens.Specimen with that id as its match.",
      };
    case "ambiguous":
      return {
        status: "unresolved",
        title: (
          <>
            Several components claim <Badge mono>{id}</Badge>.
          </>
        ),
        detail: `Specimen ids must be unique; ${String(lookup.specimens.length)} registrations use this one (${lookup.specimens.map((s) => s.label).join(", ")}). Rename all but one.`,
      };
    case "found": {
      const { specimen } = lookup;
      return {
        status: "found",
        title: specimen.label,
        ...(specimen.description === undefined
          ? {}
          : { subtitle: specimen.description }),
        badge: specimen.id,
        // Through the slot, so the specimen renders inside its own
        // contribution error boundary like any other slot item.
        render: () => <Specimens.Specimen.Dispatch id={specimen.id} />,
      };
    }
  }
}
