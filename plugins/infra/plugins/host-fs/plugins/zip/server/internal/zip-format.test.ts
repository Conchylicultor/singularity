import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnExpectOk } from "@plugins/infra/plugins/spawn/core";
import type {
  ArchiveMember,
  MemberBytes,
} from "@plugins/infra/plugins/host-fs/server";
import { decodeZipName } from "./names";
import { indexZip } from "./zip-format";

// Fixtures are made with the Info-ZIP `zip` macOS ships, from `src/`. Not
// `-X`: the extended-timestamp field it strips is what makes mtime exact — a
// bare DOS time is local time, read here in the runner's pinned UTC.
//   src/hello.txt               "hello zip\n" × 200 (compresses: deflated)
//   src/photos/2022/tiny.txt    "tiny"
//   src/naïve café.txt          a non-ASCII name
let dir: string;
const LIMIT = { maxMembers: 1000 };
const big = "hello zip\n".repeat(200);

async function zip(args: string[]): Promise<void> {
  await spawnExpectOk(["zip", "-q", ...args], {
    cwd: join(dir, "src"),
    timeoutMs: 20_000,
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "host-fs-zip-test-"));
  mkdirSync(join(dir, "src", "photos", "2022"), { recursive: true });
  writeFileSync(join(dir, "src", "hello.txt"), big);
  writeFileSync(join(dir, "src", "photos", "2022", "tiny.txt"), "tiny");
  writeFileSync(join(dir, "src", "naïve café.txt"), "accents");
  await zip(["-r", join(dir, "plain.zip"), "."]);
  await zip(["-0", "-r", join(dir, "stored.zip"), "."]);
  await zip(["-P", "secret", join(dir, "encrypted.zip"), "hello.txt"]);
  await zip(["-fz", "-r", join(dir, "zip64.zip"), "."]);
  const whole = readFileSync(join(dir, "plain.zip"));
  writeFileSync(
    join(dir, "truncated.zip"),
    whole.subarray(0, whole.length - 40),
  );
  writeFileSync(join(dir, "not-a.zip"), "just text");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function membersOf(name: string): Promise<ArchiveMember[]> {
  const res = await indexZip(join(dir, name), LIMIT);
  if (res.kind !== "ok") throw new Error(`expected ok, got ${res.reason}`);
  return res.members;
}

function fileMember(members: ArchiveMember[], path: string) {
  const m = members.find((x) => x.path === path);
  if (m?.kind !== "file") throw new Error(`no file member ${path}`);
  return m;
}

async function textOf(bytes: MemberBytes): Promise<string> {
  if (bytes.kind !== "ok") throw new Error(`unreadable: ${bytes.reason}`);
  return new Response(bytes.body).text();
}

describe("indexZip", () => {
  for (const name of ["plain.zip", "stored.zip", "zip64.zip"]) {
    test(`${name}: lists directories and files, and reads members`, async () => {
      const members = await membersOf(name);
      const dirs = members.filter((m) => m.kind === "dir").map((m) => m.path);
      expect(dirs).toEqual(expect.arrayContaining(["photos/", "photos/2022/"]));
      const hello = fileMember(members, "hello.txt");
      expect(hello.size).toBe(big.length);
      expect(await textOf(await hello.open())).toBe(big);
      expect(
        await textOf(await fileMember(members, "photos/2022/tiny.txt").open()),
      ).toBe("tiny");
      expect(Math.abs(hello.mtimeMs - Date.now())).toBeLessThan(10 * 60_000);
    });
  }

  test("a non-ASCII name decodes", async () => {
    const members = await membersOf("plain.zip");
    const names = members.map((m) => m.path.normalize("NFC"));
    expect(names).toContain("naïve café.txt");
  });

  test("a stored member is a sliceable Blob; a deflated one a stream", async () => {
    const stored = await fileMember(
      await membersOf("stored.zip"),
      "hello.txt",
    ).open();
    expect(stored.kind === "ok" && stored.body instanceof Blob).toBe(true);
    if (stored.kind === "ok" && stored.body instanceof Blob) {
      expect(await stored.body.slice(0, 5).text()).toBe("hello");
    }
    const deflated = await fileMember(
      await membersOf("plain.zip"),
      "hello.txt",
    ).open();
    expect(deflated.kind === "ok" && deflated.body instanceof Blob).toBe(false);
  });

  test("an encrypted member lists but does not open", async () => {
    const hello = fileMember(await membersOf("encrypted.zip"), "hello.txt");
    expect(await hello.open()).toEqual({
      kind: "unreadable",
      reason: "encrypted",
    });
  });

  test("a truncated zip or a non-zip is corrupt", async () => {
    expect(await indexZip(join(dir, "truncated.zip"), LIMIT)).toEqual({
      kind: "unreadable",
      reason: "corrupt",
    });
    expect(await indexZip(join(dir, "not-a.zip"), LIMIT)).toEqual({
      kind: "unreadable",
      reason: "corrupt",
    });
  });

  test("more members than allowed is too-many-entries", async () => {
    expect(await indexZip(join(dir, "plain.zip"), { maxMembers: 2 })).toEqual({
      kind: "unreadable",
      reason: "too-many-entries",
    });
  });
});

describe("decodeZipName", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  test("flagged UTF-8, unflagged valid UTF-8, and CP437", () => {
    expect(decodeZipName(new TextEncoder().encode("café"), true)).toBe("café");
    expect(decodeZipName(new TextEncoder().encode("café"), false)).toBe("café");
    // 0x82 is é in CP437, and alone it is not valid UTF-8.
    expect(decodeZipName(bytes(0x63, 0x61, 0x66, 0x82), false)).toBe("café");
  });
  test("a matching Unicode Path field wins; a stale one is ignored", () => {
    const raw = bytes(0x61, 0x82);
    const crc = Bun.hash.crc32(raw);
    expect(decodeZipName(raw, false, { nameCrc: crc, name: "aé!" })).toBe(
      "aé!",
    );
    expect(decodeZipName(raw, false, { nameCrc: crc + 1, name: "aé!" })).toBe(
      "aé",
    );
  });
});
