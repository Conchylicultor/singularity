import { describe, expect, test } from "bun:test";
import { confirmedFailures, newFailures } from "./compare";

describe("newFailures", () => {
  test("a failure already present before is not a regression", () => {
    expect(
      newFailures(
        [{ gate: "checks", failures: ["eslint"] }],
        [{ gate: "checks", failures: ["eslint", "type-check"] }],
      ),
    ).toEqual([{ gate: "checks", failures: ["type-check"] }]);
  });

  test("a gate that did not run before counts every failure", () => {
    expect(
      newFailures([], [{ gate: "smoke: go vet (gateway)", failures: ["x"] }]),
    ).toEqual([{ gate: "smoke: go vet (gateway)", failures: ["x"] }]);
  });

  test("fixed failures and clean gates contribute nothing", () => {
    expect(
      newFailures(
        [{ gate: "tests", failures: ["a > b"] }],
        [{ gate: "tests", failures: [] }],
      ),
    ).toEqual([]);
  });
});

describe("confirmedFailures", () => {
  test("keeps only what the retry reproduced", () => {
    expect(
      confirmedFailures(
        [{ gate: "tests", failures: ["a > flaky", "a > real"] }],
        [{ gate: "tests", failures: ["a > real"] }],
      ),
    ).toEqual([{ gate: "tests", failures: ["a > real"] }]);
  });

  test("a retry that passes clears the gate", () => {
    expect(
      confirmedFailures(
        [{ gate: "checks", failures: ["eslint"] }],
        [{ gate: "checks", failures: [] }],
      ),
    ).toEqual([]);
  });
});
