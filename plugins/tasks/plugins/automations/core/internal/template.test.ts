import { describe, expect, test } from "bun:test";
import {
  renderPrompt,
  templateVariables,
  unknownTemplateVariables,
} from "./template";

describe("templateVariables", () => {
  test("lists each name once, in order, tolerating inner spaces", () => {
    expect(templateVariables("{{a}} x {{ b }} {{a}}")).toEqual(["a", "b"]);
  });
});

describe("unknownTemplateVariables", () => {
  test("names what the automation does not offer", () => {
    const declared = [{ name: "reports", description: "" }];
    expect(unknownTemplateVariables("{{reports}} {{typo}}", declared)).toEqual([
      "typo",
    ]);
  });
});

describe("renderPrompt", () => {
  test("fills every placeholder", () => {
    expect(renderPrompt("A {{x}} B {{ y }}", { x: "1", y: "2" })).toEqual({
      ok: true,
      text: "A 1 B 2",
    });
  });

  test("a value containing $ patterns is inserted verbatim", () => {
    expect(renderPrompt("{{x}}", { x: "$& $1" })).toEqual({
      ok: true,
      text: "$& $1",
    });
  });

  test("refuses a placeholder with no value rather than blanking it", () => {
    expect(renderPrompt("{{x}} {{missing}}", { x: "1" })).toEqual({
      ok: false,
      unknown: ["missing"],
    });
  });
});
