import type { FieldsRecord } from "@plugins/fields/core";
import {
  isListFieldDef,
  type ListFieldDef,
} from "@plugins/fields/plugins/list/plugins/config/core";
import { isObjectFieldDef } from "@plugins/fields/plugins/object/plugins/config/core";

/**
 * Called once per list INSTANCE found in the document — not once per list field.
 * A `listField` nested in another list's `itemFields` is visited once for every
 * row of the parent, each with its own `path`.
 *
 * Return a new array to replace the instance, or nothing to leave it as it is.
 */
export type ConfigListVisitor = (
  items: Record<string, unknown>[],
  field: ListFieldDef,
  /** Dotted/indexed location in the document, e.g. `categories[0].items`. */
  path: string,
) => Record<string, unknown>[] | void;

/**
 * THE walk over every `listField` instance in a config document, at any nesting
 * depth — the one definition of "where the lists are".
 *
 * A config document is a recursive structure: a `FieldsRecord` entry may be a
 * `listField` (whose `itemFields` is another `FieldsRecord`) or an `objectField`
 * (whose `subFields` is another). Every consumer that walked it one level deep
 * — id seeding, the stable-id check, the settings "modified" diff — silently
 * skipped everything below the top level and drifted apart. They all go through
 * here now.
 *
 * Pure: returns a NEW document when anything changed and the input object
 * unchanged when nothing did, copying only along the touched paths.
 *
 * **A list is visited BEFORE its rows are recursed into**, and that order is
 * load-bearing, not incidental. A row's synthesized `auto-` id is a hash of the
 * row's content, and that content contains the row's own nested arrays — so
 * seeding nested ids first would change the hash of every enclosing row, and
 * re-mint the top-level ids of every descriptor that has a nested list. Visiting
 * outermost-first keeps those hashes exactly what they were.
 *
 * Container-ness is a closed two-member set — a field holds either one nested
 * document (`objectField`) or an array of them (`listField`) — so it is named
 * here in code rather than opened as a slot. A third container field type would
 * be the moment to promote it to a marker on `FieldDef`.
 */
export function mapConfigLists(
  doc: Record<string, unknown>,
  fields: FieldsRecord,
  visit: ConfigListVisitor,
): Record<string, unknown> {
  return mapFields(doc, fields, visit, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapFields(
  doc: Record<string, unknown>,
  fields: FieldsRecord,
  visit: ConfigListVisitor,
  prefix: string,
): Record<string, unknown> {
  let result = doc;
  // Copy-on-first-write: an untouched subtree returns its input by reference, so
  // a caller can tell "nothing changed here" by identity.
  const writable = () => (result === doc ? (result = { ...doc }) : result);

  for (const [key, field] of Object.entries(fields)) {
    const value = doc[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (isListFieldDef(field)) {
      // A key the document omits, or holds as a non-array, is left to schema
      // default-backfill — there is no list instance here to visit.
      if (!Array.isArray(value)) continue;
      const original = value as Record<string, unknown>[];

      const visited = visit(original, field, path) ?? original;
      let items = visited;
      let copied = false;

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        // A malformed row (null, a string, a nested array) has no sub-document
        // to descend into. The visitor already saw it and decided what to do.
        if (!isPlainObject(item)) continue;
        const next = mapFields(
          item,
          field.itemFields,
          visit,
          `${path}[${index}]`,
        );
        if (next === item) continue;
        if (!copied) {
          items = [...items];
          copied = true;
        }
        items[index] = next;
      }

      if (copied || visited !== original) writable()[key] = items;
      continue;
    }

    if (isObjectFieldDef(field)) {
      if (!isPlainObject(value)) continue;
      const next = mapFields(value, field.subFields, visit, path);
      if (next !== value) writable()[key] = next;
    }
  }

  return result;
}
