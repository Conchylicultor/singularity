import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import type { FieldsRecord } from "@plugins/fields/core";
import type { ConfigV2ConflictEntry } from "@plugins/config_v2/core";
import type {
  ConfigConflictContext,
  ConfigConflictField,
  ConfigConflictFieldStatus,
} from "../slots";

/**
 * Classify one field of a conflicted descriptor.
 *
 * `trueConflictKeys` is the ancestor-backed set of fields the user AND upstream
 * both changed differently — the only ones a three-way merge cannot settle. It
 * is absent for a legacy conflict with no ancestor snapshot, in which case a
 * field that merely differs is reported as `upstream-changed`, which is all we
 * can honestly say without a base to compare against.
 */
function classify(
  mine: unknown,
  upstream: unknown,
  key: string,
  trueConflictKeys: string[] | undefined,
): ConfigConflictFieldStatus {
  if (trueConflictKeys?.includes(key)) return "conflict";
  if (JSON.stringify(mine) === JSON.stringify(upstream)) return "unchanged";
  return "upstream-changed";
}

/**
 * Build the description of a config conflict handed to every
 * `ConfigDetailSlots.ConflictAction` contribution.
 *
 * Pure over what the banner already has: the descriptor's fields, the conflict
 * entry from the live resource, and the same `valueFor` the editor binds its
 * rows to (the user's override document during a hash conflict, the resolved
 * values otherwise) — so a contributed action can never describe a different
 * value than the one the user is looking at.
 */
export function buildConflictContext({
  storePath,
  name,
  scopeId,
  conflict,
  fields,
  valueFor,
  actionClassName,
}: {
  storePath: string;
  name: string;
  scopeId: string | undefined;
  conflict: ConfigV2ConflictEntry;
  fields: FieldsRecord;
  valueFor: (key: string) => unknown;
  actionClassName: ClassName;
}): ConfigConflictContext {
  const trueConflictKeys =
    conflict.kind === "hash" ? conflict.trueConflictKeys : undefined;

  const classified: ConfigConflictField[] = Object.entries(fields).map(
    ([key, field]) => {
      const mine = valueFor(key);
      const upstream = conflict.originValues[key];
      return {
        key,
        ...(field.meta.label ? { label: field.meta.label } : {}),
        ...(field.meta.description
          ? { description: field.meta.description }
          : {}),
        mine,
        upstream,
        status: classify(mine, upstream, key, trueConflictKeys),
      };
    },
  );

  return {
    storePath,
    name,
    ...(scopeId ? { scopeId } : {}),
    kind: conflict.kind,
    fields: classified,
    // Pre-joined here rather than in each consumer: the banner already renders
    // the very same "items.6" / "(root)" spelling, and two renderings of one
    // path is exactly the drift a shared context exists to prevent.
    ...(conflict.kind === "invalid" && conflict.issues
      ? {
          issues: conflict.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
            message: issue.message,
          })),
        }
      : {}),
    actionClassName,
  };
}
