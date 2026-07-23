import { describe, expect, test } from "bun:test";
import { configFileOwner } from "./config-file-owner";

describe("configFileOwner", () => {
  test("base origin anchors directly", () => {
    expect(configFileOwner("primitives/data-view/config.origin.jsonc")).toEqual({
      hier: "primitives/data-view",
      name: "config",
    });
  });

  test("base override anchors directly", () => {
    expect(configFileOwner("primitives/data-view/config.jsonc")).toEqual({
      hier: "primitives/data-view",
      name: "config",
    });
  });

  test("scoped override strips the @app/<id> segment to the base", () => {
    expect(configFileOwner("primitives/data-view/@app/foo/config.jsonc")).toEqual({
      hier: "primitives/data-view",
      name: "config",
    });
  });

  test("scoped origin strips the @app/<id> segment to the base", () => {
    expect(configFileOwner("primitives/data-view/@app/foo/config.origin.jsonc")).toEqual({
      hier: "primitives/data-view",
      name: "config",
    });
  });

  test("ancestor anchors to its base descriptor like the origin", () => {
    expect(configFileOwner("primitives/data-view/config.ancestor.jsonc")).toEqual({
      hier: "primitives/data-view",
      name: "config",
    });
  });

  test("a top-level (no-hierarchy) file has an empty hier", () => {
    expect(configFileOwner("config.origin.jsonc")).toEqual({ hier: "", name: "config" });
  });

  test("a non-config file is not owned", () => {
    expect(configFileOwner("CLAUDE.md")).toBeNull();
    expect(configFileOwner("primitives/data-view/@app/foo/CLAUDE.md")).toBeNull();
  });
});
