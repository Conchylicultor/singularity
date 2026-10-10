import { describe, expect, test } from "bun:test";
import { toolName } from "./tool-name";

describe("toolName", () => {
  test("splits an MCP tool into its name and server", () => {
    expect(toolName("mcp__singularity__add_task")).toEqual({
      id: "mcp__singularity__add_task",
      name: "add_task",
      server: "singularity",
    });
  });

  test("keeps a built-in tool whole", () => {
    expect(toolName("WebFetch")).toEqual({ id: "WebFetch", name: "WebFetch" });
  });
});
