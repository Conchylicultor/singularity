import { describe, expect, test } from "bun:test";
import { fillClasses } from "./fill";

describe("fillClasses", () => {
  test("x axis pairs flex-1 with the horizontal min override", () => {
    expect(fillClasses("x")).toBe("min-w-0 flex-1");
  });

  test("y axis pairs flex-1 with the vertical min override", () => {
    expect(fillClasses("y")).toBe("min-h-0 flex-1");
  });
});
