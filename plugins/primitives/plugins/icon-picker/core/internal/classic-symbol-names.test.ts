import { describe, expect, it } from "bun:test";
import { isSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { CLASSIC_SYMBOL_NAMES } from "./classic-symbol-names";
import { symbolNameForClassic } from "./classic";

/**
 * The classic → Symbols table is what every saved icon migrates through, on
 * every clone — so it must cover every classic key, land on names the sets
 * draw, and be a fixed point (re-running the migration changes nothing).
 */
describe("CLASSIC_SYMBOL_NAMES", () => {
  const entries = Object.entries(CLASSIC_SYMBOL_NAMES);

  it("covers all 2 160 classic Material Icons keys", () => {
    expect(entries).toHaveLength(2160);
  });

  it("maps every key to a Material Symbols name", () => {
    expect(entries.filter(([, v]) => !isSavedSymbolName(v))).toEqual([]);
  });

  it("is a fixed point: a value that is also a classic key maps to itself", () => {
    const broken = entries.filter(([, v]) => {
      const asKey = v.replace(/-/g, "_");
      return (
        Object.hasOwn(CLASSIC_SYMBOL_NAMES, asKey) &&
        CLASSIC_SYMBOL_NAMES[asKey] !== v
      );
    });
    expect(broken).toEqual([]);
  });

  it("resolves a classic key, and nothing else", () => {
    const resolve = (key: string): string | undefined =>
      symbolNameForClassic(key);
    expect(resolve("add_circle_outline")).toBe("add-circle");
    expect(resolve("phone")).toBe("call");
    expect(resolve("precision_manufacturing")).toBe("precision-manufacturing");
    expect(symbolNameForClassic("toString")).toBeUndefined();
    expect(symbolNameForClassic("add-circle")).toBeUndefined();
  });
});
