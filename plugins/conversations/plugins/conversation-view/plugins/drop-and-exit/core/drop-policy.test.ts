import { test, expect } from "bun:test";
import { dropsTask } from "./drop-policy";

test("the manual Drop & Close drops unmerged commits, keeps landed work", () => {
  expect(dropsTask("none", "unless-landed")).toBe(true);
  expect(dropsTask("pending", "unless-landed")).toBe(true);
  expect(dropsTask("landed", "unless-landed")).toBe(false);
});

test("the agent-driven close drops only when there is no work at all", () => {
  expect(dropsTask("none", "only-if-no-work")).toBe(true);
  expect(dropsTask("pending", "only-if-no-work")).toBe(false);
  expect(dropsTask("landed", "only-if-no-work")).toBe(false);
});
