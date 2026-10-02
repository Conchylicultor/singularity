import { useMemo } from "react";
import type { FieldSample } from "../../core";
import { fieldRendererSlot, fieldSampleSlot } from "./slots";

/**
 * One row of the field-type gallery: the type's contributed sample, or — for a
 * type that contributes a renderer but no sample — `missing`, so the gap is
 * shown rather than the type silently dropping out of the gallery.
 */
export type FieldSampleEntry =
  | {
      readonly kind: "sample";
      readonly typeId: string;
      readonly sample: FieldSample;
    }
  | { readonly kind: "missing"; readonly typeId: string };

/**
 * Every field type's fixed sample, sorted by field type id. Generic over the
 * open set: it names no field type. A type contributing two samples throws —
 * a gallery row per type is the contract.
 */
export function useFieldSamples(): readonly FieldSampleEntry[] {
  const samples = fieldSampleSlot.useContributions();
  const renderers = fieldRendererSlot.useContributions();
  return useMemo(() => {
    const byType = new Map<string, FieldSampleEntry>();
    for (const s of samples) {
      const typeId = s.field.type.id;
      if (byType.has(typeId)) {
        throw new Error(
          `[config-v2.fields] field type "${typeId}" contributes more than one Fields.Sample`,
        );
      }
      byType.set(typeId, {
        kind: "sample",
        typeId,
        sample: { field: s.field, value: s.value },
      });
    }
    for (const r of renderers) {
      if (typeof r.match !== "string" || byType.has(r.match)) continue;
      byType.set(r.match, { kind: "missing", typeId: r.match });
    }
    return [...byType.values()].sort((a, b) =>
      a.typeId.localeCompare(b.typeId),
    );
  }, [samples, renderers]);
}
