import { describe, expect, it } from "bun:test";
import {
  pgRelease,
  versionMismatches,
  type PackagePins,
} from "./version-match";

const pins = (file: string, v: string, prefix: string): PackagePins => ({
  file,
  pins: Object.fromEntries(
    ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"].map((p) => [
      `${prefix}${p}`,
      v,
    ]),
  ),
});
const client = (v: string) => pins("client.json", v, "@equin/pg-client-");
const server = (v: string) => pins("server.json", v, "@embedded-postgres/");

describe("pgRelease", () => {
  it("reads major.minor, ignoring a pre-release tag", () => {
    expect(pgRelease("18.3.0")).toBe("18.3");
    expect(pgRelease("18.3.0-beta.17")).toBe("18.3");
    expect(pgRelease("latest")).toBeNull();
  });
});

describe("versionMismatches", () => {
  it("accepts the same Postgres release", () => {
    expect(
      versionMismatches(client("18.3.0"), server("18.3.0-beta.17")),
    ).toEqual([]);
  });

  it("rejects a minor-version drift", () => {
    expect(
      versionMismatches(client("18.4.0"), server("18.3.0-beta.17")),
    ).toEqual([expect.stringContaining("client tools are Postgres 18.4")]);
  });

  it("rejects platform pins that disagree within one file", () => {
    const c = client("18.3.0");
    c.pins["@equin/pg-client-linux-x64"] = "18.3.1";
    expect(versionMismatches(c, server("18.3.0-beta.17"))).toEqual([
      expect.stringContaining("different versions"),
    ]);
  });
});
