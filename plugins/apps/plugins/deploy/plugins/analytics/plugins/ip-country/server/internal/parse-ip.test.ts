import { describe, expect, test } from "bun:test";
import { parseIp, parseIpLiteral } from "./parse-ip";

describe("parseIp", () => {
  test("IPv4", () => {
    expect(parseIp("0.0.0.0")).toEqual({ kind: "v4", value: 0 });
    expect(parseIp("1.2.3.4")).toEqual({ kind: "v4", value: 0x01020304 });
    expect(parseIp("255.255.255.255")).toEqual({
      kind: "v4",
      value: 0xffffffff,
    });
  });

  test("IPv6, full and compressed", () => {
    const full = parseIp("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(full).toEqual({ kind: "v6", hi: 0x20010db800000000n, lo: 1n });
    expect(parseIp("2001:db8::1")).toEqual(full);
    expect(parseIp("::")).toEqual({ kind: "v6", hi: 0n, lo: 0n });
    expect(parseIp("::1")).toEqual({ kind: "v6", hi: 0n, lo: 1n });
    expect(parseIp("fe80::")).toEqual({
      kind: "v6",
      hi: 0xfe80000000000000n,
      lo: 0n,
    });
    expect(parseIp("FFFF:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toEqual({
      kind: "v6",
      hi: 0xffffffffffffffffn,
      lo: 0xffffffffffffffffn,
    });
  });

  test("an IPv4-mapped IPv6 address becomes the IPv4 address", () => {
    expect(parseIp("::ffff:1.2.3.4")).toEqual({
      kind: "v4",
      value: 0x01020304,
    });
    expect(parseIp("::ffff:102:304")).toEqual({
      kind: "v4",
      value: 0x01020304,
    });
    // ...but the literal parse keeps what was written.
    expect(parseIpLiteral("::ffff:1.2.3.4")).toEqual({
      kind: "v6",
      hi: 0n,
      lo: 0xffff01020304n,
    });
  });

  test("a zone id is rejected", () => {
    expect(parseIp("fe80::1%en0")).toEqual({ kind: "invalid" });
  });

  test("anything else is invalid", () => {
    for (const bad of [
      "",
      "unknown",
      "1.2.3",
      "1.2.3.4.5",
      "256.1.1.1",
      "01.2.3.4",
      "1.2.3.-1",
      "1::2::3",
      ":1",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "1:2:3:4::5:6:7:8",
      "12345::",
      "g::",
      "::1.2.3",
    ]) {
      expect({ bad, parsed: parseIp(bad) }).toEqual({
        bad,
        parsed: { kind: "invalid" },
      });
    }
  });
});
