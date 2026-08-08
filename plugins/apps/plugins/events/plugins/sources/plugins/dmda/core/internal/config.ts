import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const DMDA_SOURCE_TYPE_ID = "dmda";

/** The one site this type reads. Shared so the fetcher and the web link agree. */
export const DMDA_ORIGIN = "https://www.desmotsetdesarts.com";

/**
 * The site's own guided-visit categories, exactly as its filter tabs publish
 * them: `value` is the `kind` the JSON API takes, `path` the human page.
 *
 * A closed list in `core/` rather than a slot — per the repo's own rule, a set
 * that can be enumerated today is plain data. The site has these five tabs and a
 * sixth would be a one-line edit here.
 */
export const DMDA_KINDS = [
  { value: "all", label: "Toutes", path: "/visites-guidees" },
  { value: "11", label: "Musée", path: "/visites-guidees/musee" },
  { value: "12", label: "Galerie", path: "/visites-guidees/galerie" },
  { value: "13", label: "Balade", path: "/visites-guidees/balade" },
  { value: "35", label: "En famille", path: "/visites-guidees/en-famille" },
] as const;

/**
 * The whole user input for a Des Mots et Des Arts source: which category to
 * track. The endpoint itself is hardcoded — this type stands for exactly one
 * site, so a URL field would only be a way to point it at something it cannot
 * read.
 *
 * `core/` on purpose — web-safe *and* server-usable, so ONE record both
 * validates the row's `config` jsonb and renders the add/configure form
 * generically. This plugin therefore ships no form code.
 */
export const dmdaSourceConfigFields = {
  kind: enumField({
    label: "Category",
    description: "Which of the site's guided-visit categories to track.",
    options: DMDA_KINDS.map((k) => ({ value: k.value, label: k.label })),
    default: "all",
  }),
} satisfies FieldsRecord;

export type DmdaSourceConfig = InferFieldsObject<typeof dmdaSourceConfigFields>;

/** The site's own page for a configured category, or `null` for an unknown id. */
export function dmdaKindPath(kind: string): string | null {
  return DMDA_KINDS.find((k) => k.value === kind)?.path ?? null;
}
