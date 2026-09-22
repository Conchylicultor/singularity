/**
 * What a specimen says about itself — everything but the component.
 *
 * A specimen is one REAL app component a plugin exhibits on its own, rendered
 * inside the running app, so it gets real slot contributions, config and data.
 * It is an exhibit, not a working copy: it renders standalone at any width,
 * holds whatever state it needs locally, and never submits, navigates or
 * writes anything.
 */
export interface SpecimenMeta {
  /** What a person calls it: "Task composer (Improve)". */
  label: string;
  description?: string;
  /**
   * The widths (px) this component has something to say about — where it
   * changes shape. Optional: a consumer supplies its own when absent.
   */
  widths?: readonly [number, ...number[]];
}

/** The props a specimen is rendered with — its own id, nothing else. */
export interface SpecimenProps {
  id: string;
}

/** A registered specimen, as a lookup reports it. */
export interface SpecimenInfo extends SpecimenMeta {
  /** Stable, globally unique id: `<plugin>/<name>`, e.g. `task-draft/composer`. */
  id: string;
}

/**
 * The result of looking a specimen up by id. Two plugins claiming the same id
 * is its own arm rather than "whichever registered first", so a clash is seen
 * instead of silently resolved.
 */
export type SpecimenLookup =
  | { kind: "found"; specimen: SpecimenInfo }
  | { kind: "missing" }
  | { kind: "ambiguous"; specimens: readonly SpecimenInfo[] };
