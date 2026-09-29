import { describe, expect, test } from "bun:test";
import {
  isNewerRelease,
  parseLockUpdates,
  parseUvLockVersions,
  uvCutoff,
} from "./uv-updater";

describe("uv updater parsing", () => {
  test("reads the Update lines of a uv lock run", () => {
    const output = [
      "Using CPython 3.12.14",
      "Resolved 2 packages in 425ms",
      "Update numpy v2.5.3 -> v2.5.4",
      "Update certifi v2026.8.1 -> v2026.9.2",
    ].join("\n");
    expect(parseLockUpdates(output)).toEqual([
      { pkg: "numpy", from: "2.5.3", to: "2.5.4" },
      { pkg: "certifi", from: "2026.8.1", to: "2026.9.2" },
    ]);
    expect(parseLockUpdates("Lockfile changes detected\n")).toEqual([]);
  });

  test("reads package versions out of a uv.lock", () => {
    const lock = `version = 1
requires-python = ">=3.12"

[options]
exclude-newer = "2026-09-26T00:00:00Z"

[[package]]
name = "hello-python"
version = "0.0.0"
source = { virtual = "." }

[[package]]
name = "numpy"
version = "2.5.3"
source = { registry = "https://pypi.org/simple" }
`;
    const versions = parseUvLockVersions(lock);
    expect(versions.get("numpy")).toBe("2.5.3");
    expect(versions.get("hello-python")).toBe("0.0.0");
    expect(versions.has("exclude-newer")).toBe(false);
  });

  test("the cooldown cutoff is the start of the UTC day, three days back", () => {
    expect(uvCutoff(new Date("2026-09-29T17:46:09Z"))).toBe(
      "2026-09-26T00:00:00.000Z",
    );
    expect(uvCutoff(new Date("2026-09-29T00:00:01Z"))).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });

  test("a downgrade proposed under an older cutoff is not an upgrade", () => {
    expect(isNewerRelease("2.5.4", "2.5.3")).toBe(true);
    expect(isNewerRelease("2.5.0", "2.5.3")).toBe(false);
    expect(isNewerRelease("2026.9.2", "2026.8.1")).toBe(true);
    expect(isNewerRelease("1.0", "1.0.0")).toBe(false);
  });
});
