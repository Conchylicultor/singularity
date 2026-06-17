import { describe, expect, test } from "bun:test";
import { frameGridTemplate } from "./frame";

const ALL_ABSENT = {
  leading: false,
  content: false,
  meta: false,
  trailing: false,
};

describe("frameGridTemplate", () => {
  test("all four slots present", () => {
    expect(
      frameGridTemplate({
        leading: true,
        content: true,
        meta: true,
        trailing: true,
      }),
    ).toBe("auto minmax(0,max-content) minmax(0,1fr) auto");
  });

  test("content + meta only", () => {
    expect(
      frameGridTemplate({ ...ALL_ABSENT, content: true, meta: true }),
    ).toBe("minmax(0,max-content) minmax(0,1fr)");
  });

  test("leading + content + trailing (the CollapsibleCard shape, no meta)", () => {
    // A spacer `1fr` takes meta's slot so `trailing` pins right and `content`
    // is never centered — the regression this fix guards against.
    expect(
      frameGridTemplate({
        leading: true,
        content: true,
        meta: false,
        trailing: true,
      }),
    ).toBe("auto minmax(0,max-content) minmax(0,1fr) auto");
  });

  test("content only", () => {
    expect(frameGridTemplate({ ...ALL_ABSENT, content: true })).toBe(
      "minmax(0,max-content)",
    );
  });

  test("leading + trailing only (spacer pins trailing right)", () => {
    expect(
      frameGridTemplate({ ...ALL_ABSENT, leading: true, trailing: true }),
    ).toBe("auto minmax(0,1fr) auto");
  });

  test("meta only", () => {
    expect(frameGridTemplate({ ...ALL_ABSENT, meta: true })).toBe(
      "minmax(0,1fr)",
    );
  });

  test("nothing present yields an empty template", () => {
    expect(frameGridTemplate(ALL_ABSENT)).toBe("");
  });

  test("track order is fixed regardless of which slots are present", () => {
    // meta present but content absent must still slot meta after a leading auto
    expect(
      frameGridTemplate({
        leading: true,
        content: false,
        meta: true,
        trailing: true,
      }),
    ).toBe("auto minmax(0,1fr) auto");
  });
});
