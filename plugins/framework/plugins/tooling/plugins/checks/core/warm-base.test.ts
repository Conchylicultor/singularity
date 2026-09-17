/**
 * The warm-base pool decides which `.tsbuildinfo` a checkout starts its
 * type-check from, and that choice is worth 2 GB / 30 s against 7 GB / 240 s
 * per target. Nothing downstream can catch a bad choice — a mismatched base is
 * not WRONG, it is merely slow, so it fails silently and forever.
 *
 * So the cases below are the two rules that make the choice, and the one rule
 * that keeps the good entry reachable:
 *   1–5. selection by content overlap: seeded, cold, replaced, kept, and a torn
 *        candidate among good ones;
 *   6–8. retention: a sha label, protection of entries on `main` and its cap,
 *        an unavailable HEAD, and legacy unlabelled names;
 *     9. the resolve-base trap that made every pooled candidate score zero.
 *
 * Pure filesystem: the pool is pointed at a temp data root via
 * `SINGULARITY_DIR` (the sanctioned way — every `DataDir` read resolves it per
 * call), and git is a fake, because what is being tested is what the pool DOES
 * with git's answers, not git.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readProgramFileList } from "./buildinfo";
import type { ContentHashMemo } from "./content-hash";
import { tsBuildInfoPath } from "./discover";
import {
  materializeWarmBase,
  publishWarmBase,
  type WarmBaseOutcome,
} from "./warm-base";
import type { WarmBaseGitFacts } from "./warm-base-git";

const TARGET = "warm-base-suite-target";

let root = "";
let dataRoot = "";
const priorDataRoot = process.env.SINGULARITY_DIR;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "warm-base-root-"));
  dataRoot = mkdtempSync(join(tmpdir(), "warm-base-data-"));
  process.env.SINGULARITY_DIR = dataRoot;
});

afterEach(() => {
  if (priorDataRoot === undefined) delete process.env.SINGULARITY_DIR;
  else process.env.SINGULARITY_DIR = priorDataRoot;
  rmSync(root, { recursive: true, force: true });
  rmSync(dataRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures

/** Write a repo source file and return the version tsc would record for it. */
function source(rel: string, text: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return createHash("sha256").update(text).digest("hex");
}

/**
 * A buildinfo as tsc writes one: `fileNames` relative to the file's OWN
 * directory, `fileInfos` parallel to it.
 *
 * Every entry here is written for a file that will sit at
 * `<root>/.cache/tsbuildinfo/`, which is where a pooled candidate is scored as
 * if it already sat — so the relative prefix is the same whether the bytes end
 * up in the pool or locally.
 */
function buildInfo(entries: { rel: string; version: string }[]): string {
  return JSON.stringify({
    fileNames: entries.map((e) => `../../${e.rel}`),
    fileInfos: entries.map((e) => ({
      version: e.version,
      signature: e.version,
    })),
  });
}

function writeLocal(entries: { rel: string; version: string }[]): void {
  const abs = tsBuildInfoPath(root, TARGET);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buildInfo(entries));
}

/** Publish one entry into the pool by going through the real publish path. */
async function publish(
  entries: { rel: string; version: string }[],
  headSha: string | undefined,
  git: Pick<WarmBaseGitFacts, "isAncestorOfMain"> = neverOnMain,
): Promise<void> {
  writeLocal(entries);
  await publishWarmBase(root, TARGET, headSha, git);
  rmSync(tsBuildInfoPath(root, TARGET), { force: true });
  // Ids lead with a millisecond, and a suite publishes faster than that — so
  // step the clock, or "newest" becomes whatever `readdir` felt like.
  await Bun.sleep(2);
}

function poolNames(): string[] {
  const dir = join(dataRoot, "cache", "tsbuildinfo");
  const versions = existsSync(dir) ? readdirSync(dir) : [];
  const target = versions
    .map((v) => join(dir, v, TARGET))
    .find((d) => existsSync(d));
  if (target === undefined) return [];
  return readdirSync(target).sort().reverse();
}

function poolDir(): string {
  const dir = join(dataRoot, "cache", "tsbuildinfo");
  const version = readdirSync(dir)[0]!;
  return join(dir, version, TARGET);
}

const neverOnMain: Pick<WarmBaseGitFacts, "isAncestorOfMain"> = {
  isAncestorOfMain: () => Promise.resolve({ ok: true as const, value: false }),
};
const alwaysOnMain: Pick<WarmBaseGitFacts, "isAncestorOfMain"> = {
  isAncestorOfMain: () => Promise.resolve({ ok: true as const, value: true }),
};

/** `isAncestorOfMain` answering from a set of shas, and counting its calls. */
function onMain(shas: string[]): {
  git: Pick<WarmBaseGitFacts, "isAncestorOfMain">;
  asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    git: {
      isAncestorOfMain: (_root, sha) => {
        asked.push(sha);
        return Promise.resolve({
          ok: true as const,
          value: shas.includes(sha),
        });
      },
    },
  };
}

function pick(): WarmBaseOutcome {
  const memo: ContentHashMemo = new Map();
  return materializeWarmBase(root, TARGET, memo);
}

const SHA = (n: number): string => `${n}`.repeat(40).slice(0, 40);

// ------------------------------------------------------------- 1–5: choice

test("1. no local base, one candidate → seeded, and the line says how well it fits", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const b = source("src/b.ts", "export const b = 2;\n");
  await publish(
    [
      { rel: "src/a.ts", version: a },
      { rel: "src/b.ts", version: b },
    ],
    SHA(1),
  );

  const outcome = pick();
  expect(outcome.target).toBe(TARGET);
  expect(outcome.line).toContain("seeded 2/2 from pool ");
  expect(existsSync(tsBuildInfoPath(root, TARGET))).toBe(true);
});

test("2. no local base and an empty pool → a cold line, and nothing written", () => {
  source("src/a.ts", "export const a = 1;\n");
  const outcome = pick();
  expect(outcome.line).toBe(
    `type-check: warm base ${TARGET}: cold, pool empty`,
  );
  expect(existsSync(tsBuildInfoPath(root, TARGET))).toBe(false);
});

test("3. a pooled entry that matches MORE files than the local base replaces it", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const b = source("src/b.ts", "export const b = 2;\n");
  // The pooled entry is right about both files.
  await publish(
    [
      { rel: "src/a.ts", version: a },
      { rel: "src/b.ts", version: b },
    ],
    SHA(1),
  );
  // The local base is right about one — the just-rebased worktree's shape.
  writeLocal([
    { rel: "src/a.ts", version: a },
    { rel: "src/b.ts", version: "stale".padEnd(64, "0") },
  ]);

  const outcome = pick();
  expect(outcome.line).toContain("matched 2/2 files (local 1, replaced)");
  // The bytes really were replaced: the local file is now the pooled entry's.
  const local = readFileSync(tsBuildInfoPath(root, TARGET), "utf8");
  expect(local).toBe(readFileSync(join(poolDir(), poolNames()[0]!), "utf8"));
});

test("4. a pooled entry that ties or loses leaves the local base untouched", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const b = source("src/b.ts", "export const b = 2;\n");
  // A tie: both know one file. A tie must NOT displace the local base, because
  // the local one also carries this worktree's own delta.
  await publish([{ rel: "src/a.ts", version: a }], SHA(1));
  writeLocal([{ rel: "src/b.ts", version: b }]);
  const before = readFileSync(tsBuildInfoPath(root, TARGET), "utf8");

  const outcome = pick();
  expect(outcome.line).toContain("kept local 1/1 (best pool 1)");
  expect(readFileSync(tsBuildInfoPath(root, TARGET), "utf8")).toBe(before);
});

test("5. a torn candidate is skipped, and the good one is still chosen", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  await publish([{ rel: "src/a.ts", version: a }], SHA(1));
  // A publisher killed mid-write leaves half a JSON document behind.
  writeFileSync(
    join(poolDir(), `${Date.now()}-999-${SHA(2).slice(0, 12)}.tsbuildinfo`),
    '{"fileNames": [',
  );

  const outcome = pick();
  expect(outcome.line).toContain("seeded 1/1 from pool ");
  expect(outcome.line).toContain("1 unreadable");
  expect(existsSync(tsBuildInfoPath(root, TARGET))).toBe(true);
});

// -------------------------------------------------------- 6–8: retention

test("6. beyond the newest three, an entry on `main` is protected and one that is not is dropped", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const entries = [{ rel: "src/a.ts", version: a }];
  // Six publishes, oldest first, every one of them on main — so all six
  // survive their own prunes (three newest + three protected) and the seventh
  // publish below is the one whose verdict this test reads.
  for (let i = 1; i <= 6; i++) await publish(entries, SHA(i), alwaysOnMain);
  const before = poolNames();
  expect(before).toHaveLength(6);

  // Now publish a seventh, protecting exactly one of the older shas.
  const keeper = SHA(2).slice(0, 12);
  const { git, asked } = onMain([keeper]);
  writeLocal(entries);
  const result = await publishWarmBase(root, TARGET, SHA(7), git);

  expect(result.published).toBe(true);
  expect(result.labelled).toBe(true);
  // The newest three (7, 6, 5) plus the one on main.
  expect(result.kept).toBe(4);
  expect(result.protectedOnMain).toBe(1);
  const names = poolNames();
  expect(names).toHaveLength(4);
  expect(names.some((n) => n.includes(keeper))).toBe(true);
  // Only entries BEYOND the newest three (7, 6, 5) are ever asked about:
  // the four older ones, 4 down to 1.
  expect(asked).toHaveLength(4);
  expect(asked).not.toContain(SHA(7).slice(0, 12));
});

test("6b. protection caps at six, so the pool stays bounded", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const entries = [{ rel: "src/a.ts", version: a }];
  // Twelve entries, every one of them on main.
  for (let i = 1; i <= 12; i++) {
    await publish(entries, SHA(i), alwaysOnMain);
  }
  // The newest 3 + at most 6 protected.
  expect(poolNames()).toHaveLength(9);
});

test("7. an unavailable HEAD publishes an unlabelled entry rather than throwing", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  writeLocal([{ rel: "src/a.ts", version: a }]);

  const result = await publishWarmBase(root, TARGET, undefined, neverOnMain);
  expect(result.published).toBe(true);
  expect(result.labelled).toBe(false);

  const names = poolNames();
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^\d+-\d+\.tsbuildinfo$/);

  // And it is still a perfectly good base to select.
  rmSync(tsBuildInfoPath(root, TARGET), { force: true });
  expect(pick().line).toContain("seeded 1/1 from pool ");
});

test("8. legacy unlabelled entries are never protected and never error", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const entries = [{ rel: "src/a.ts", version: a }];
  for (let i = 0; i < 5; i++) await publish(entries, undefined);

  const { git, asked } = onMain([]);
  writeLocal(entries);
  const result = await publishWarmBase(root, TARGET, SHA(9), git);

  // Nothing unlabelled can be protected, so only the newest three survive.
  expect(result.kept).toBe(3);
  expect(result.protectedOnMain).toBe(0);
  expect(poolNames()).toHaveLength(3);
  // Unlabelled entries carry no sha, so git is never asked about them at all.
  expect(asked).toHaveLength(0);
});

test("8b. an entry past the age bound is dropped even when it is on `main`", async () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  const entries = [{ rel: "src/a.ts", version: a }];
  for (let i = 1; i <= 4; i++) await publish(entries, SHA(i), alwaysOnMain);

  // Age the oldest survivor past the 14-day bound.
  const oldest = poolNames().at(-1)!;
  const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  utimesSync(join(poolDir(), oldest), longAgo, longAgo);

  writeLocal(entries);
  const result = await publishWarmBase(root, TARGET, SHA(5), alwaysOnMain);
  expect(poolNames()).not.toContain(oldest);
  expect(result.kept).toBe(poolNames().length);
});

test("8c. nothing to publish is said, not silently counted as a publish", async () => {
  const result = await publishWarmBase(root, TARGET, SHA(1), alwaysOnMain);
  expect(result.published).toBe(false);
  expect(poolNames()).toHaveLength(0);
});

// ------------------------------------------------ 9: the resolve-base trap

test("9. readProgramFileList resolves against the base it is GIVEN, not the file's own directory", () => {
  const a = source("src/a.ts", "export const a = 1;\n");
  // Two directories down, so the fixture's `../../` prefix climbs back to the
  // data root — the same depth `.cache/tsbuildinfo/` sits at under a worktree.
  const elsewhere = join(dataRoot, "elsewhere", "deeper", "web.tsbuildinfo");
  mkdirSync(dirname(elsewhere), { recursive: true });
  writeFileSync(elsewhere, buildInfo([{ rel: "src/a.ts", version: a }]));

  // Its own directory: the paths land beside it, where nothing exists — which
  // is exactly how a pooled candidate silently scored zero.
  const own = readProgramFileList(elsewhere);
  expect(own).toMatchObject({
    kind: "files",
    files: [join(dataRoot, "src/a.ts")],
  });

  // Scored as if it already sat at the destination, the paths are the real ones.
  const asDestination = readProgramFileList(
    elsewhere,
    dirname(tsBuildInfoPath(root, TARGET)),
  );
  expect(asDestination).toEqual({
    kind: "files",
    files: [join(root, "src/a.ts")],
    versions: [a],
  });
});
