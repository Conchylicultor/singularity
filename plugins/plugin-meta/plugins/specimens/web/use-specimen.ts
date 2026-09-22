import { useMemo } from "react";
import { Specimens } from "./slots";
import { lookupSpecimen } from "./lookup";
import type { SpecimenInfo, SpecimenLookup } from "./types";

/**
 * Look one specimen up by id in this worktree's registry — its metadata only.
 * Render it with `<Specimens.Specimen.Dispatch id={id}/>`.
 */
export function useSpecimen(id: string): SpecimenLookup {
  const contributions = Specimens.Specimen.useContributions();
  const all = useMemo(
    () =>
      contributions.flatMap((c): SpecimenInfo[] =>
        // The id is a plain string by contract; a RegExp / predicate `match`
        // names no single specimen, so it is not an exhibit anyone can ask for.
        typeof c.match === "string"
          ? [
              {
                id: c.match,
                label: c.label,
                ...(c.description === undefined
                  ? {}
                  : { description: c.description }),
                ...(c.widths === undefined ? {} : { widths: c.widths }),
              },
            ]
          : [],
      ),
    [contributions],
  );
  return lookupSpecimen(all, id);
}
