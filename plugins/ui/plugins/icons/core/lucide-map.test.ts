import { describe, expect, it } from "bun:test";
import { LUCIDE_MAP, MATERIAL_ONLY, lucideNameOf } from "./lucide-map";

describe("lucideNameOf", () => {
  it("names a mapped symbol's Lucide counterpart", () => {
    expect(lucideNameOf("folder")).toBe("folder");
    expect(lucideNameOf("home")).toBe("house");
    expect(lucideNameOf("delete")).toBe("trash-2");
    expect(lucideNameOf("close")).toBe("x");
    expect(lucideNameOf("left-panel-open")).toBe("panel-left");
  });

  it("is undefined for a material-only symbol and for one the map does not know", () => {
    expect(LUCIDE_MAP.grain).toBe(MATERIAL_ONLY);
    expect(lucideNameOf("grain")).toBeUndefined();
    expect(lucideNameOf("not-a-symbol")).toBeUndefined();
  });
});
