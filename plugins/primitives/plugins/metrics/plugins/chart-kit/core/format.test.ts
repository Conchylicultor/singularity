import { describe, expect, it } from "bun:test";
import { NO_VALUE, formatAxis, formatSigned, formatValue } from "./format";

describe("formatValue", () => {
  it("count / lines: grouped below 10k, compact above", () => {
    expect(formatValue("count", 1284)).toBe("1,284");
    expect(formatValue("lines", 12_900)).toBe("12.9K");
    expect(formatValue("count", -3)).toBe("−3");
  });

  it("usd: cents below $100, whole dollars below $10k, compact above", () => {
    expect(formatValue("usd", 4.2)).toBe("$4.20");
    expect(formatValue("usd", 1284.4)).toBe("$1,284");
    expect(formatValue("usd", 4_200_000)).toBe("$4.2M");
    expect(formatValue("usd", -12.5)).toBe("−$12.50");
  });

  it("seconds: the largest whole unit", () => {
    expect(formatValue("seconds", 42)).toBe("42s");
    expect(formatValue("seconds", 750)).toBe("12.5m");
    expect(formatValue("seconds", 12_600)).toBe("3.5h");
    expect(formatValue("seconds", 129_600)).toBe("1.5d");
  });

  it("percent: a fraction", () => {
    expect(formatValue("percent", 0.423)).toBe("42.3%");
    expect(formatValue("percent", 1)).toBe("100%");
  });

  it("null reads as no value, never 0", () => {
    expect(formatValue("count", null)).toBe(NO_VALUE);
    expect(formatSigned("usd", null)).toBe(NO_VALUE);
  });
});

describe("formatSigned", () => {
  it("adds + on positive values only", () => {
    expect(formatSigned("count", 12)).toBe("+12");
    expect(formatSigned("count", -12)).toBe("−12");
    expect(formatSigned("count", 0)).toBe("0");
  });
});

describe("formatAxis", () => {
  it("is compact in every unit", () => {
    expect(formatAxis("count", 12_000)).toBe("12K");
    expect(formatAxis("count", 250)).toBe("250");
    expect(formatAxis("usd", 12_000)).toBe("$12K");
    expect(formatAxis("usd", -500)).toBe("−$500");
    expect(formatAxis("seconds", 7200)).toBe("2h");
    expect(formatAxis("percent", 0.25)).toBe("25%");
  });
});
