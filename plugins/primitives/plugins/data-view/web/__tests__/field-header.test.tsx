import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { FieldDef } from "../../core";
import { useSortController } from "../internal/use-sort-controller";

/**
 * `FieldDef.header` is the TABLE column's header only: a field with
 * `header: false` (an unlabelled column) is still listed, by its `label`, in
 * the pickers — the sort picker reads `sortableFields`.
 */

type Row = { phase: string };

const FIELDS: FieldDef<Row>[] = [
  { id: "phase", label: "Phase", header: false, value: (r) => r.phase },
];

describe("FieldDef.header", () => {
  it("a header: false field is still listed, by its label, in the sort picker", () => {
    const { result } = renderHook(() =>
      useSortController(FIELDS, [], () => {}),
    );
    const phase = result.current.sortableFields.find((f) => f.id === "phase");
    expect(phase?.label).toBe("Phase");
  });
});
