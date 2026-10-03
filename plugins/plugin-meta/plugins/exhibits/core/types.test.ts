import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import {
  appExhibit,
  exhibitGroupOf,
  isExhibit,
  isolatedExhibit,
  regionExhibit,
} from "./types";

const load = () => Promise.resolve({ default: () => null });

describe("exhibit factories", () => {
  it("stamp the runtime discriminant", () => {
    expect(
      isolatedExhibit({
        id: "g/a",
        label: "A",
        widths: [200],
        render: () => createElement("div"),
      }).runtime,
    ).toBe("isolated");
    expect(
      regionExhibit({
        id: "g/r",
        label: "R",
        widths: [200],
        render: (c) => createElement("div", null, c),
      }).runtime,
    ).toBe("isolated-region");
    expect(appExhibit({ id: "g/app", label: "App", load }).runtime).toBe("app");
  });

  it("an app exhibit cannot carry geometry — a tsc error, and nothing at runtime", () => {
    const exhibit = appExhibit({
      id: "g/app",
      label: "App",
      load,
      // @ts-expect-error — app exhibits need the live app; the bare measurer page cannot render them.
      geometry: {
        dims: { contentLen: "short", withMeta: false, state: "idle" },
        invariants: [],
      },
    });
    expect("geometry" in exhibit).toBe(false);
  });
});

describe("isExhibit", () => {
  it("accepts every arm", () => {
    expect(
      isExhibit(
        isolatedExhibit({
          id: "g/a",
          label: "A",
          widths: [200, 400],
          render: () => createElement("div"),
          geometry: {
            dims: { contentLen: "long", withMeta: true, state: "running" },
            invariants: [{ kind: "noClip" }],
          },
        }),
      ),
    ).toBe(true);
    expect(isExhibit(appExhibit({ id: "g/app", label: "App", load }))).toBe(
      true,
    );
  });

  it("rejects malformed contributions", () => {
    expect(isExhibit(null)).toBe(false);
    // No group prefix.
    expect(isExhibit(appExhibit({ id: "nogroup", label: "X", load }))).toBe(
      false,
    );
    // Isolated without widths.
    expect(
      isExhibit({
        runtime: "isolated",
        id: "g/a",
        label: "A",
        render: () => null,
      }),
    ).toBe(false);
    // Unknown runtime.
    expect(isExhibit({ runtime: "bare", id: "g/a", label: "A" })).toBe(false);
    // An app exhibit smuggling geometry in through a raw literal.
    expect(
      isExhibit({ runtime: "app", id: "g/a", label: "A", load, geometry: {} }),
    ).toBe(false);
  });
});

describe("exhibitGroupOf", () => {
  it("is the id prefix", () => {
    expect(exhibitGroupOf("task-draft/composer")).toBe("task-draft");
    expect(exhibitGroupOf("control-panel/setting-rail/long")).toBe(
      "control-panel",
    );
  });

  it("throws on an id with no group", () => {
    expect(() => exhibitGroupOf("loose")).toThrow('is not "<group>/<name>"');
  });
});
