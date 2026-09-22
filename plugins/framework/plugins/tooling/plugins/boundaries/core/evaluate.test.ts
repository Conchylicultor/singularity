import { describe, expect, test } from "bun:test";
import type { PluginFolder } from "@plugins/framework/plugins/plugin-id/core";
import boundaryConfig from "./boundary-config";
import { judgeImport, type ImportVerdict } from "./evaluate";

const at = (zone: string, folder: PluginFolder, test = false) =>
  ({ kind: "folder", zone, folder, test }) as const;

const judge = (
  source: ReturnType<typeof at>,
  target: ReturnType<typeof at>,
): ImportVerdict["kind"] =>
  judgeImport(boundaryConfig.folders, new Set(), source, target).kind;

describe("judgeImport — test code", () => {
  test("shipping code cannot import its own test code, even in one folder", () => {
    expect(judge(at("plugin.a", "core"), at("plugin.a", "core", true))).toBe(
      "test-code",
    );
  });

  test("shipping code cannot import another plugin's testing barrel", () => {
    expect(judge(at("plugin.a", "server"), at("plugin.b", "core", true))).toBe(
      "test-code",
    );
  });

  test("e2e gets no testing barrels", () => {
    expect(judge(at("plugin.a", "e2e"), at("plugin.b", "core", true))).toBe(
      "test-code",
    );
  });

  test("a test may import a sibling test file", () => {
    expect(
      judge(at("plugin.a", "web", true), at("plugin.a", "web", true)),
    ).toBe("ok");
  });

  test("a check may import its own core/testing", () => {
    expect(judge(at("plugin.a", "check"), at("plugin.a", "core", true))).toBe(
      "ok",
    );
  });

  test("a test may import the testing barrel of a folder its row allows", () => {
    expect(
      judge(at("plugin.a", "web", true), at("plugin.b", "core", true)),
    ).toBe("cross-plugin");
  });

  test("a test still follows its folder's row", () => {
    expect(
      judge(at("plugin.a", "core", true), at("plugin.a", "server", true)),
    ).toBe("runtime");
    expect(
      judge(at("plugin.a", "server", true), at("plugin.b", "web", true)),
    ).toBe("runtime");
  });
});

describe("judgeImport — production code", () => {
  test("a row-allowed import across plugins goes on to the zone edges", () => {
    expect(judge(at("plugin.a", "web"), at("plugin.b", "core"))).toBe(
      "cross-plugin",
    );
  });

  test("a folder's own files are reachable", () => {
    expect(judge(at("plugin.a", "check"), at("plugin.a", "check"))).toBe("ok");
  });

  test("a row-denied import is a runtime violation", () => {
    expect(judge(at("plugin.a", "core"), at("plugin.a", "server"))).toBe(
      "runtime",
    );
  });
});
