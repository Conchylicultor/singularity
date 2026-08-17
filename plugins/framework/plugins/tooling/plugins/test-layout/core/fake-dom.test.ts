/**
 * Detector tests for rule (e). Every fixture below is a *string*, and
 * `fakeDomInstalls` masks string interiors before scanning — which is exactly
 * why this suite can spell out the banned idiom without the check reporting the
 * file that tests it. A pure-logic suite, so it sits next to its source under
 * `bun:test` (and, fittingly, installs no globals of its own).
 */

import { describe, expect, test } from "bun:test";
import { fakeDomInstalls } from "./fake-dom";

/** The names reported, in source order. */
function names(src: string): string[] {
  return fakeDomInstalls(src).map((i) => i.name);
}

describe("fakeDomInstalls", () => {
  test("reports a plain assignment to a browser global", () => {
    expect(names("globalThis.window = {};")).toEqual(["window"]);
    expect(names("global.document = {};")).toEqual(["document"]);
  });

  test("reports the cast form the crashing suite used", () => {
    const src = [
      "(globalThis as Record<string, unknown>).window = { sessionStorage };",
      "(globalThis as Record<string, unknown>).sessionStorage = sessionStorage;",
    ].join("\n");
    expect(names(src)).toEqual(["window", "sessionStorage"]);
  });

  test("reports indexed and defineProperty installs", () => {
    expect(names('globalThis["localStorage"] = memory;')).toEqual([
      "localStorage",
    ]);
    expect(
      names(
        "Object.defineProperty(globalThis, 'ResizeObserver', { value: X });",
      ),
    ).toEqual(["ResizeObserver"]);
  });

  test("ignores globals that are not part of a DOM", () => {
    expect(names("globalThis.myTestHook = () => {};")).toEqual([]);
    expect(names("globalThis.fetch = fakeFetch;")).toEqual([]);
    expect(names('globalThis["__DEV__"] = true;')).toEqual([]);
  });

  test("ignores reads, comparisons and member writes — only installs count", () => {
    expect(
      names("if (typeof globalThis.window === 'undefined') return;"),
    ).toEqual([]);
    expect(names("expect(globalThis.window == null).toBe(true);")).toEqual([]);
    // Writing THROUGH an existing global is not installing one.
    expect(names("globalThis.window.scrollY = 10;")).toEqual([]);
  });

  test("ignores an install that is only mentioned in a comment or a string", () => {
    expect(names("// globalThis.window = {};")).toEqual([]);
    expect(names("/* globalThis.document = {}; */")).toEqual([]);
    expect(names('const snippet = "globalThis.window = {}";')).toEqual([]);
  });

  test("reports the offset of the install, so a caller can name the line", () => {
    const src = "const a = 1;\nglobalThis.navigator = {};\n";
    const [install] = fakeDomInstalls(src);
    expect(install?.name).toBe("navigator");
    expect(src.slice(install!.index)).toStartWith("globalThis.navigator");
  });

  test("reports each install once, in source order", () => {
    const src = "globalThis.history = {};\nglobalThis.window = {};\n";
    expect(names(src)).toEqual(["history", "window"]);
  });
});
