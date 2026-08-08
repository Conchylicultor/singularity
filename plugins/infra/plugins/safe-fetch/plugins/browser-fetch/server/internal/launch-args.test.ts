import { describe, expect, test } from "bun:test";
import {
  buildLaunchArgs,
  buildResolverRules,
  CATCH_ALL_RESOLVER_RULE,
} from "./launch-args";

function resolverRules(args: string[]): string {
  const flag = args.find((a) => a.startsWith("--host-resolver-rules="));
  if (!flag) throw new Error("no --host-resolver-rules in argv");
  return flag.slice("--host-resolver-rules=".length);
}

describe("buildResolverRules", () => {
  test("pins the target host to its validated IP", () => {
    expect(buildResolverRules("shotgun.live", "76.76.21.21")).toBe(
      "MAP shotgun.live 76.76.21.21,MAP * ~NOTFOUND",
    );
  });

  test("brackets an IPv6 replacement", () => {
    expect(buildResolverRules("example.com", "2606:4700::1111")).toBe(
      "MAP example.com [2606:4700::1111],MAP * ~NOTFOUND",
    );
  });

  // THE structural backstop. Chromium applies resolver rules in order, so a
  // `MAP *` ahead of the pin would swallow the pin itself; and without the rule
  // at all, anything slipping past request interception reaches Chromium's own
  // unguarded resolver.
  test("`MAP * ~NOTFOUND` is always the LAST rule", () => {
    for (const [host, ip] of [
      ["example.com", "93.184.216.34"],
      ["a.b.c.example.org", "2001:db8::1"],
    ] as const) {
      const rules = buildResolverRules(host, ip).split(",");
      expect(rules.at(-1)).toBe(CATCH_ALL_RESOLVER_RULE);
      expect(rules).toHaveLength(2);
    }
  });
});

describe("buildLaunchArgs", () => {
  const args = buildLaunchArgs("shotgun.live", "76.76.21.21");

  test("carries the pinned resolver rules, catch-all last", () => {
    expect(resolverRules(args).split(",").at(-1)).toBe(CATCH_ALL_RESOLVER_RULE);
  });

  // Both of these would be easy "fixes" for a launch or TLS problem, and both
  // would void the plugin's security posture: the sandbox is the containment for
  // the hostile JS we execute, and the pin is meaningless if cert identity is not
  // verified against the real hostname.
  test("NEVER disables the sandbox or certificate verification", () => {
    for (const arg of args) {
      expect(arg).not.toContain("--no-sandbox");
      expect(arg).not.toContain("--disable-setuid-sandbox");
      expect(arg).not.toContain("--ignore-certificate-errors");
      expect(arg).not.toContain("--disable-web-security");
      expect(arg).not.toContain("--allow-running-insecure-content");
    }
  });

  test("caps the renderer JS heap and silences background networking", () => {
    expect(args).toContain("--disable-background-networking");
    expect(args.some((a) => a.startsWith("--js-flags="))).toBe(true);
  });
});
