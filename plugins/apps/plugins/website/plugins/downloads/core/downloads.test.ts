import { describe, expect, it } from "bun:test";
import { detectPlatform } from "./downloads";

describe("detectPlatform", () => {
  it("detects macOS", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
    ).toBe("macos");
  });

  it("detects Windows", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    ).toBe("windows");
  });

  it("detects Linux", () => {
    expect(
      detectPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"),
    ).toBe("linux");
  });

  it("returns null for an unrecognized agent", () => {
    expect(detectPlatform("SomeUnknownBot/1.0")).toBeNull();
  });
});
