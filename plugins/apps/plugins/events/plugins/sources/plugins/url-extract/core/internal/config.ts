import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";
import { nullable } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const URL_SOURCE_TYPE_ID = "url";

/**
 * The whole user input for a web-page source: a URL, and an optional sentence of
 * guidance handed straight to the extraction model.
 *
 * `core/` on purpose — web-safe *and* server-usable, so ONE record both validates
 * the row's `config` jsonb (`fieldsToZodObject`, in `events-core`'s source repo)
 * and renders the add/configure form generically. This plugin therefore ships no
 * form code at all.
 */
export const urlSourceConfigFields = {
  url: textField({
    label: "Page URL",
    placeholder: "https://www.fitzroy-paris.com/soirees",
  }),
  hint: nullable(
    textField({
      label: "Extraction hint",
      description:
        "Optional guidance for the extractor, e.g. 'only the club nights, ignore private hire'.",
    }),
  ),
} satisfies FieldsRecord;

export type UrlSourceConfig = InferFieldsObject<typeof urlSourceConfigFields>;
