import { test, expect } from "bun:test";
import { snakeCase } from "./snake-case";

test("snakeCase maps camelCase JS props to snake_case column names", () => {
  expect(snakeCase("operationKind")).toBe("operation_kind");
  expect(snakeCase("totalMs")).toBe("total_ms");
  expect(snakeCase("firstSeenAt")).toBe("first_seen_at");
});

test("snakeCase leaves single-word identifiers untouched", () => {
  expect(snakeCase("worktree")).toBe("worktree");
  expect(snakeCase("count")).toBe("count");
  expect(snakeCase("id")).toBe("id");
});
