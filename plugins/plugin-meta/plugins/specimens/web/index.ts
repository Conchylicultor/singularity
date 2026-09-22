import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Specimens } from "./slots";

export { Specimens } from "./slots";
export { useSpecimen } from "./use-specimen";
export { lookupSpecimen } from "./lookup";
export type {
  SpecimenInfo,
  SpecimenLookup,
  SpecimenMeta,
  SpecimenProps,
} from "./types";

export default {
  description:
    "Specimen registry: a plugin exhibits one of its REAL components (Specimens.Specimen, a dispatch slot keyed on the id: label, optional widths, a self-contained component) so another surface can render it standalone inside the running app, with real slots, config and data. useSpecimen(id) answers found / missing / ambiguous; <Specimens.Specimen.Dispatch id/> renders it isolated. Owns the slot; knows no contributor.",
  contributions: [],
  slots: Specimens,
} satisfies PluginDefinition;
