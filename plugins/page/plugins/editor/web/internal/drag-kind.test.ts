import { describe, expect, test } from "bun:test";
import { dragKindFromTypes } from "./drag-kind";
import { BLOCKS_MIME } from "./transfer";

describe("dragKindFromTypes", () => {
  test("files beat everything below them", () => {
    expect(dragKindFromTypes(["Files", BLOCKS_MIME, "text/plain"])).toBe(
      "files",
    );
  });

  test("a block forest beats text", () => {
    expect(dragKindFromTypes([BLOCKS_MIME, "text/plain"])).toBe("forest");
  });

  test("text/plain is text", () => {
    expect(dragKindFromTypes(["text/plain", "text/html"])).toBe("text");
  });

  test("a uri-list-only drag is text too", () => {
    expect(dragKindFromTypes(["text/uri-list"])).toBe("text");
  });

  test("markup we cannot land is nothing", () => {
    expect(dragKindFromTypes(["text/html"])).toBe("none");
    expect(dragKindFromTypes([])).toBe("none");
  });

  test("Lexical's own drag is refused, ahead of every other type it carries", () => {
    // The real marker never travels alone — `$writeDragSourceToDataTransfer`
    // rides along with the selection's text/plain + text/html — so the refusal
    // is only worth anything when it outranks them.
    expect(
      dragKindFromTypes([
        "application/x-lexical-drag",
        "text/plain",
        "text/html",
      ]),
    ).toBe("none");
    expect(dragKindFromTypes(["application/x-lexical-drag", "Files"])).toBe(
      "none",
    );
  });
});
