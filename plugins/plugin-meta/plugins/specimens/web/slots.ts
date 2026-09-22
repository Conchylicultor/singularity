import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { SpecimenMeta, SpecimenProps } from "./types";

/**
 * The specimen registry's one extension point: a DISPATCH slot keyed on the
 * specimen id (the contribution's `match`, always a plain string). A consumer
 * renders exactly one specimen with `<Specimens.Specimen.Dispatch id="…"/>`,
 * which gives it the slot's error isolation; `useSpecimen(id)` reads the
 * metadata beside it. Not a render slot: there is no list order to curate.
 *
 * ```ts
 * Specimens.Specimen({
 *   match: "task-draft/composer",   // the id: `<plugin>/<name>`, globally unique
 *   label: "Task composer (Improve)",
 *   component: ComposerSpecimen,    // ComponentType<SpecimenProps>
 * })
 * ```
 */
export const Specimens = {
  Specimen: defineDispatchSlot<SpecimenProps, string, SpecimenMeta>({
    key: (p) => p.id,
    docLabel: (c) => (typeof c.match === "string" ? c.match : c.label),
  }),
};
