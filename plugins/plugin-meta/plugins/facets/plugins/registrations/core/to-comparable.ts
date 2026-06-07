import type { DocMetaRegistration } from "./types";

/** Diff projection: one `runtime: factory('label')` string per registration.
 *  Mirrors formatRegistration (facet/index.ts) so diff matches doc rendering.
 *  No legacy registrationStrings() existed — this defines the diff. */
export function registrationsToComparable(data: DocMetaRegistration[]): string[] {
  return data.map((r) => {
    const body = !r.factory
      ? (r.doc.label ?? r.kind)
      : r.doc.label
        ? `${r.factory}('${r.doc.label}')`
        : `${r.factory}()`;
    return `${r.runtime}: ${body}`;
  });
}
