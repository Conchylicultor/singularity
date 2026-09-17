import { describe, expect, test } from "bun:test";
import { parseReferrer, primaryLanguage, visitorHash } from "./request-context";

describe("primaryLanguage", () => {
  test("first entry's primary subtag, lowercased", () => {
    expect(primaryLanguage("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
    expect(primaryLanguage("EN-us")).toBe("en");
  });
  test("absent or wildcard is null", () => {
    expect(primaryLanguage(null)).toBeNull();
    expect(primaryLanguage("*")).toBeNull();
  });
});

describe("parseReferrer", () => {
  test("host normalised, path kept, query dropped", () => {
    expect(
      parseReferrer("https://www.GitHub.com/a/b?tab=readme#x", "equin.dev"),
    ).toEqual({ host: "github.com", path: "/a/b" });
  });
  test("self-referral is no referrer", () => {
    expect(parseReferrer("https://equin.dev/story", "equin.dev")).toBeNull();
    expect(
      parseReferrer("http://localhost:9000/x", "localhost:9000"),
    ).toBeNull();
  });
  test("empty or not a URL is no referrer", () => {
    expect(parseReferrer("", "equin.dev")).toBeNull();
    expect(parseReferrer("not a url", "equin.dev")).toBeNull();
  });
});

describe("visitorHash", () => {
  const parts = {
    salt: "s",
    ip: "203.0.113.7",
    userAgent: "ua",
    host: "equin.dev",
  };
  test("stable for the same inputs, different for a new salt", () => {
    expect(visitorHash(parts)).toBe(visitorHash(parts));
    expect(visitorHash({ ...parts, salt: "t" })).not.toBe(visitorHash(parts));
  });
  test("field boundaries cannot be shifted", () => {
    expect(visitorHash({ ...parts, ip: "1", userAgent: "2ua" })).not.toBe(
      visitorHash({ ...parts, ip: "12", userAgent: "ua" }),
    );
  });
});
