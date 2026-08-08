import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";
import { nullable } from "@plugins/fields/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const URL_SOURCE_TYPE_ID = "url";

/**
 * How the page's bytes are obtained. NOT how they are read — every mode feeds
 * the identical pipeline afterwards, which is what keeps "we started a browser"
 * from ever changing what a page *means*.
 *
 * - `auto` — a plain HTTP fetch, escalating to a real browser only when the site
 *   answers a *failing* response carrying bot-mitigation evidence. Deliberately
 *   never escalates on a 200, however thin: that could only be a content
 *   threshold, and a threshold makes the same URL yield plain text on one tick
 *   and browser text on the next — a fingerprint that flips, and a Sonnet call
 *   paid every 15 minutes for a page nobody changed.
 * - `plain` — never start a browser. A challenge then parks the source rather
 *   than being worked around behind the user's back.
 * - `browser` — always render with JavaScript. The right answer for a page whose
 *   listing exists only after its scripts run, and it skips the wasted plain
 *   fetch on a site that challenges every request.
 */
export const URL_FETCH_MODES = ["auto", "plain", "browser"] as const;
export type UrlFetchMode = (typeof URL_FETCH_MODES)[number];

/**
 * A total record rather than a second literal list: tsc fails the moment a mode
 * is added without a label, so the union and the radio buttons cannot drift.
 */
const FETCH_MODE_LABEL: Record<UrlFetchMode, string> = {
  auto: "Auto",
  plain: "Plain fetch",
  browser: "Browser render",
};

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
  // Between `url` and `hint` because field order IS render order, and this is a
  // property of HOW the URL is read — `hint` is a later, model-facing concern.
  //
  // `enumField`, never `enumTextField`: the latter's `type` is `textFieldType`,
  // so `FieldRenderer` would dispatch it to a free-text input and the closed set
  // would only be enforced after the user typed something wrong.
  //
  // No migration: `fieldsToZodObject` wraps every field with
  // `.default(field.defaultValue)`, so the rows written before this field
  // existed parse to `"auto"` on both runtimes.
  fetchMode: enumField({
    label: "Fetch mode",
    description:
      "Auto fetches the HTML directly and only starts a browser when the site answers with a bot " +
      "challenge. Browser render always loads the page with JavaScript — slower, and the right " +
      "choice when the page looks fine in your own browser but the extractor finds no events.",
    options: URL_FETCH_MODES.map((value) => ({
      value,
      label: FETCH_MODE_LABEL[value],
    })),
    default: "auto",
    display: "radio",
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
