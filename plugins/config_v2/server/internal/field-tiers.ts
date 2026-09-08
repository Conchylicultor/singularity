import { mapConfigLists } from "../../core";
import type { ConfigV2Tiers, JsonValue, ResolvedLayer } from "../../core";
import type { FieldsRecord } from "@plugins/fields/core";

/**
 * WHICH LAYER SUPPLIED EACH FIELD'S VALUE — per field, not per document.
 *
 * `readTypedConfigWithLayer` says which layer won for the document as a whole;
 * this refines that to a per-key answer, because a user override is a FULL copy
 * of the document (`setConfig` writes `{ ...current, [key]: value }`), so a
 * winning override "contains" the git layer's value for every field the user
 * never touched.
 *
 *   "user"    — the user layer won AND this key's value differs from the origin's
 *   "git"     — the value comes from the propagated origin, which itself differs
 *               from what `defineConfig` declared (a committed authored override,
 *               or a build-materialized origin like a reorder slot's catalog)
 *   "default" — the value is what the code declares
 *
 * `"user"` is the definition of "modified" in the settings pane. It is deliberately
 * NOT "differs from `descriptor.defaults`": the git layer is what the repo commits,
 * and a value the repo commits is not something the user changed. For a reorder
 * directive (`originDefaultsFrom: "build"`) the two are never equal — its declared
 * default is `[]` while its origin is the live contribution catalog — so the old
 * basis reported every reorder config as permanently modified.
 *
 * Pure: it takes the two documents, never the filesystem. Provider-backed (secret)
 * fields are NOT decided here — the caller forces them to "default" afterwards,
 * because `registerFieldStorageProvider` is a module side effect and a memoized
 * answer taken before it ran would stick.
 */
export function computeFieldTiers({
  fields,
  defaults,
  layer,
  originContent,
  overrideContent,
}: {
  fields: FieldsRecord;
  defaults: Record<string, unknown>;
  layer: ResolvedLayer;
  originContent: JsonValue | null;
  overrideContent: JsonValue | null;
}): ConfigV2Tiers {
  // Both sides of every comparison go through the SAME normal form, so a
  // difference means a difference in what the user configured.
  const defaultsDoc = diffNormalForm(defaults, fields);
  // No origin document means no git layer to compare against — the code defaults
  // ARE the baseline (readTypedConfig's tier 3). Standing in the defaults here,
  // rather than an empty document, is what keeps every field "default" instead of
  // reading the absence as "the repo committed something different".
  const originDoc =
    originContent === null
      ? defaultsDoc
      : diffNormalForm(asDocument(originContent), fields);
  // Only a WINNING override can have modified anything. A stale, foreign or
  // schema-invalid override is one the runtime is ignoring wholesale (it resolves
  // to the origin), and it differs from the origin in every key — reading those
  // as the user's edits marked every field of such a config as modified, and
  // offered a Reset for each. While a config is in conflict its banner's
  // Keep / Accept / Merge own the resolution; no field is "modified".
  const overrideDoc =
    layer === "user"
      ? diffNormalForm(asDocument(overrideContent), fields)
      : null;

  const tiers: ConfigV2Tiers = {};
  for (const key of Object.keys(fields)) {
    // A key the override document does not carry was never claimed by the user —
    // it self-heals to the field default on the next write. Fall through to the
    // git comparison rather than reading the absence as an edit.
    if (overrideDoc !== null && key in overrideDoc) {
      if (json(overrideDoc[key]) !== json(originDoc[key])) {
        tiers[key] = "user";
        continue;
      }
    }
    tiers[key] =
      json(originDoc[key]) !== json(defaultsDoc[key]) ? "git" : "default";
  }
  return tiers;
}

function json(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function asDocument(content: JsonValue | null): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return {};
}

/**
 * Do two config documents say the same thing? — the whole-document twin of the
 * per-key comparison above, sharing its normal form so "this field is no longer
 * modified" and "this document no longer says anything the git layer doesn't"
 * cannot disagree. Used by the per-field Reset to decide whether the user layer
 * still has anything left to say.
 *
 * Compared key-by-key over the union, so a document that merely lists its keys in
 * a different order still agrees.
 */
export function configDocumentsAgree(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  fields: FieldsRecord,
): boolean {
  const na = diffNormalForm(a, fields);
  const nb = diffNormalForm(b, fields);
  for (const key of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    if (json(na[key]) !== json(nb[key])) return false;
  }
  return true;
}

/**
 * The normal form two config documents must be in before they can be compared.
 *
 * `normalizeCollectionItems` synthesizes an `auto-<hash>` id onto every id-less
 * row of a non-`stableIdentity` list, on read and on write — so a user override
 * on disk carries those ids. The BASE user-layer origin does not: it is
 * propagated byte-wise from a git origin that codegen never normalizes. So a user
 * who toggles one boolean gets a full-document write that seeds ids into an
 * untouched list field, and that field then compares unequal to the origin
 * forever.
 *
 * Dropping the id on both sides removes the asymmetry without depending on WHEN
 * an id was minted. A `stableIdentity` list is left alone: its ids are durable
 * external keys the consumer owns (a DataView's per-view saved order keys off
 * them), so a differing id there is a real difference.
 *
 * Comparison-only. Nothing here is ever written back.
 */
function diffNormalForm(
  doc: Record<string, unknown>,
  fields: FieldsRecord,
): Record<string, unknown> {
  return mapConfigLists(doc, fields, (rows, field) => {
    if (field.stableIdentity) return;
    return rows.map((row) => {
      const { id: _id, ...rest } = row;
      return rest;
    });
  });
}
