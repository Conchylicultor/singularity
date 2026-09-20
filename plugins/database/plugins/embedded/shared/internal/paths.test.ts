import { describe, expect, test } from "bun:test";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/namespace/core";
import { PG_BASE_DATABASE } from "./paths";

describe("PG_BASE_DATABASE", () => {
  // The start script that creates this database imports node builtins and its
  // own `shared/` only — no `@plugins/…` alias — so the name is a literal there
  // by construction. A test file has no such restriction, which makes this the
  // one place the literal and the namespace it must equal can be held together.
  test("is main's namespace", () => {
    expect(PG_BASE_DATABASE).toBe(MAIN_WORKTREE_NAME);
  });
});
