import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintDir } from "./hash-dir";

const dirs: string[] = [];

async function makeDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "thumb-fp-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, "utf8");
  }
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe("fingerprintDir", () => {
  test("identical content hashes identically across folders", async () => {
    const a = await makeDir({ "index.html": "<h1>hi</h1>", "app.js": "x" });
    const b = await makeDir({ "app.js": "x", "index.html": "<h1>hi</h1>" });

    expect(await fingerprintDir(a)).toBe(await fingerprintDir(b));
  });

  test("a byte change changes the hash", async () => {
    const dir = await makeDir({ "index.html": "<h1>hi</h1>" });
    const before = await fingerprintDir(dir);

    await writeFile(join(dir, "index.html"), "<h1>hi!</h1>", "utf8");

    expect(await fingerprintDir(dir)).not.toBe(before);
  });

  test("a touch that changes no bytes does not change the hash", async () => {
    const dir = await makeDir({ "index.html": "<h1>hi</h1>" });
    const before = await fingerprintDir(dir);

    const later = new Date(Date.now() + 60_000);
    await utimes(join(dir, "index.html"), later, later);

    expect(await fingerprintDir(dir)).toBe(before);
  });

  test("moving content between files changes the hash", async () => {
    const a = await makeDir({ "one.js": "alpha", "two.js": "beta" });
    const b = await makeDir({ "one.js": "beta", "two.js": "alpha" });

    expect(await fingerprintDir(a)).not.toBe(await fingerprintDir(b));
  });

  test("subdirectories are skipped, not hashed as empty names", async () => {
    const dir = await makeDir({ "index.html": "<h1>hi</h1>" });
    const before = await fingerprintDir(dir);

    await mkdir(join(dir, "nested"));

    expect(await fingerprintDir(dir)).toBe(before);
  });
});
