import { describe, expect, test } from "bun:test";
import { channelOf, normalizeHost } from "./channel";

describe("channelOf", () => {
  test("any utm tag makes it a campaign, whatever the referrer", () => {
    expect(channelOf("google.com", { source: "newsletter" })).toBe("Campaign");
    expect(channelOf(null, { campaign: "launch" })).toBe("Campaign");
  });
  test("empty utm tags do not", () => {
    expect(channelOf(null, { source: "" })).toBe("Direct");
  });
  test("no referrer is direct", () => {
    expect(channelOf(null, undefined)).toBe("Direct");
  });
  test("search engines on any TLD and subdomain", () => {
    expect(channelOf("www.google.com", undefined)).toBe("Search");
    expect(channelOf("google.co.uk", undefined)).toBe("Search");
    expect(channelOf("duckduckgo.com", undefined)).toBe("Search");
    expect(channelOf("search.brave.com", undefined)).toBe("Search");
  });
  test("a host merely containing a search stem is not search", () => {
    expect(channelOf("googleblog.example", undefined)).toBe("Referral");
    expect(channelOf("notbing.com", undefined)).toBe("Referral");
  });
  test("social networks, including subdomains", () => {
    expect(channelOf("news.ycombinator.com", undefined)).toBe("Social");
    expect(channelOf("x.com", undefined)).toBe("Social");
    expect(channelOf("m.facebook.com", undefined)).toBe("Social");
    expect(channelOf("old.reddit.com", undefined)).toBe("Social");
  });
  test("everything else is a referral", () => {
    expect(channelOf("github.com", undefined)).toBe("Referral");
    expect(channelOf("dev.to", undefined)).toBe("Referral");
  });
});

describe("normalizeHost", () => {
  test("lowercases and drops www.", () => {
    expect(normalizeHost("WWW.Example.COM")).toBe("example.com");
  });
});
