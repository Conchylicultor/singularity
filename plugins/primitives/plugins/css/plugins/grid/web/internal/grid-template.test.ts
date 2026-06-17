import { describe, expect, test } from "bun:test";
import { gridTemplateColumns } from "./grid";

describe("gridTemplateColumns", () => {
  test("fill mode is the default responsive path (auto-fill)", () => {
    expect(gridTemplateColumns({ minCellWidth: "12rem", mode: "fill" })).toBe(
      "repeat(auto-fill, minmax(12rem, 1fr))",
    );
  });

  test("fit mode collapses empty tracks (auto-fit)", () => {
    expect(gridTemplateColumns({ minCellWidth: "12rem", mode: "fit" })).toBe(
      "repeat(auto-fit, minmax(12rem, 1fr))",
    );
  });

  test("fixed cols wins over minCellWidth/mode", () => {
    expect(
      gridTemplateColumns({ minCellWidth: "12rem", mode: "fit", cols: 3 }),
    ).toBe("repeat(3, minmax(0, 1fr))");
  });

  test("a rem minCellWidth is interpolated verbatim", () => {
    expect(gridTemplateColumns({ minCellWidth: "8.5rem", mode: "fill" })).toBe(
      "repeat(auto-fill, minmax(8.5rem, 1fr))",
    );
  });
});
