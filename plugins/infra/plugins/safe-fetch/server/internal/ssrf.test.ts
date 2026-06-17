import { describe, expect, test } from "bun:test";
import { SsrfError, isPrivateIp, parsePublicUrl } from "./ssrf";

describe("isPrivateIp", () => {
  test("classifies loopback as private", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.1.2.3")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  test("classifies RFC1918 private ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
  });

  test("172.32.x is public (outside the /12)", () => {
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
  });

  test("classifies link-local and cloud metadata", () => {
    expect(isPrivateIp("169.254.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  test("classifies CGNAT 100.64/10", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.255")).toBe(true);
    expect(isPrivateIp("100.63.0.1")).toBe(false);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });

  test("classifies unspecified addresses", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("0.1.2.3")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
  });

  test("classifies IPv6 ULA fc00::/7", () => {
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456::1")).toBe(true);
  });

  test("unwraps IPv4-mapped IPv6 and classifies the v4", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  test("treats public IPs and global-unicast IPv6 as public", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  test("does not treat bare hostnames as private (resolver decides)", () => {
    expect(isPrivateIp("example.com")).toBe(false);
  });
});

describe("parsePublicUrl", () => {
  test("accepts public http(s) URLs", () => {
    expect(parsePublicUrl("https://example.com/path").hostname).toBe(
      "example.com",
    );
    expect(parsePublicUrl("http://8.8.8.8:8080/").hostname).toBe("8.8.8.8");
  });

  test("rejects localhost and .localhost subdomains", () => {
    expect(() => parsePublicUrl("http://localhost/")).toThrow(SsrfError);
    expect(() => parsePublicUrl("http://foo.localhost:3000/")).toThrow(
      SsrfError,
    );
  });

  test("rejects literal private/loopback/link-local hosts", () => {
    expect(() => parsePublicUrl("http://127.0.0.1/")).toThrow(SsrfError);
    expect(() => parsePublicUrl("http://10.0.0.5/")).toThrow(SsrfError);
    expect(() => parsePublicUrl("http://192.168.1.1/")).toThrow(SsrfError);
    expect(() => parsePublicUrl("http://169.254.169.254/latest/meta-data")).toThrow(
      SsrfError,
    );
    expect(() => parsePublicUrl("http://[::1]/")).toThrow(SsrfError);
    expect(() => parsePublicUrl("http://[fc00::1]/")).toThrow(SsrfError);
  });

  test("rejects non-http(s) schemes", () => {
    expect(() => parsePublicUrl("ftp://example.com/file")).toThrow(SsrfError);
    expect(() => parsePublicUrl("file:///etc/passwd")).toThrow(SsrfError);
  });

  test("rejects unparseable URLs", () => {
    expect(() => parsePublicUrl("not a url")).toThrow(SsrfError);
    expect(() => parsePublicUrl("")).toThrow(SsrfError);
  });
});
