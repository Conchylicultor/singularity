import type {
  FieldGrouping,
  FieldValue,
  GroupBucket,
} from "@plugins/primitives/plugins/data-view/core";

/**
 * The bool type's single grouping: a **No** section and a **Yes** section.
 *
 * `key` stays `String(value)` — the identity data-view bucketed on before this
 * moved out of the primitive — so a collapsed section survives the change.
 * Order puts `false` first, matching the type's own `asc` reading ("Unchecked
 * first", `boolIdentity.directionLabels`).
 *
 * Nothing is planned per render, so the plan phase closes over nothing.
 */
function bucketBool(value: FieldValue): GroupBucket {
  return {
    key: String(value),
    label: value ? "Yes" : "No",
    order: value ? 1 : 0,
  };
}

export const boolGroupings: FieldGrouping[] = [
  { id: "value", label: "Value", plan: () => bucketBool },
];
