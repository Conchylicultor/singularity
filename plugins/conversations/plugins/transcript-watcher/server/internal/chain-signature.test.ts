import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chainEtag,
  chainFileEtag,
  statChain,
  transcriptChainSignature,
} from "./chain-signature";

const PATH_A = "/projects/proj/session-a.jsonl";
const PATH_B = "/projects/proj/session-b.jsonl";

describe("chainFileEtag", () => {
  test("identical inputs ⇒ identical string", () => {
    expect(chainFileEtag(PATH_A, 1000, 4096)).toBe(chainFileEtag(PATH_A, 1000, 4096));
  });

  test("a grown transcript (size change) ⇒ a different string", () => {
    expect(chainFileEtag(PATH_A, 1000, 4096)).not.toBe(chainFileEtag(PATH_A, 1000, 8192));
  });

  test("an mtime change ⇒ a different string", () => {
    expect(chainFileEtag(PATH_A, 1000, 4096)).not.toBe(chainFileEtag(PATH_A, 2000, 4096));
  });

  test("a resolved-path change ⇒ a different string", () => {
    expect(chainFileEtag(PATH_A, 1000, 4096)).not.toBe(chainFileEtag(PATH_B, 1000, 4096));
  });

  test("mtime and size are not conflated", () => {
    expect(chainFileEtag(PATH_A, 4096, 1000)).not.toBe(chainFileEtag(PATH_A, 1000, 4096));
  });
});

describe("chainEtag", () => {
  const fileA = { path: PATH_A, mtimeMs: 1000, size: 4096 };
  const fileB = { path: PATH_B, mtimeMs: 2000, size: 8192 };

  test("an empty chain ⇒ \"none\"", () => {
    expect(chainEtag(0, [])).toBe("none");
  });

  test("identical chains ⇒ identical string", () => {
    expect(chainEtag(2, [fileA, fileB])).toBe(chainEtag(2, [fileA, fileB]));
  });

  test("an append to any chain file ⇒ a different string", () => {
    const grown = { ...fileA, mtimeMs: 1500, size: 5000 };
    expect(chainEtag(2, [fileA, fileB])).not.toBe(chainEtag(2, [grown, fileB]));
  });

  test("a NEW chain entry ⇒ a different string", () => {
    expect(chainEtag(1, [fileA])).not.toBe(chainEtag(2, [fileA, fileB]));
  });

  test("a chain file vanishing under us ⇒ a different string", () => {
    expect(chainEtag(2, [fileA, fileB])).not.toBe(chainEtag(2, [fileA]));
  });

  test("a vanished tail never collides with a genuinely shorter chain", () => {
    // Chain of 2 whose second file is gone must not look like a chain of 1.
    expect(chainEtag(2, [fileA])).not.toBe(chainEtag(1, [fileA]));
  });

  test("chain order is significant", () => {
    expect(chainEtag(2, [fileA, fileB])).not.toBe(chainEtag(2, [fileB, fileA]));
  });

  test("a non-empty chain never looks empty", () => {
    expect(chainEtag(1, [])).not.toBe("none");
  });
});

describe("statChain / transcriptChainSignature", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "chain-signature-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("stats every chain file in order", async () => {
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    await writeFile(a, "one\n");
    await writeFile(b, "two\nthree\n");

    const stats = await statChain([a, b]);
    expect(stats.map((s) => s.path)).toEqual([a, b]);
    expect(stats[0]!.size).toBe(4);
    expect(stats[1]!.size).toBe(10);
  });

  test("omits a vanished file", async () => {
    const a = join(dir, "a.jsonl");
    await writeFile(a, "one\n");
    const gone = join(dir, "gone.jsonl");

    expect((await statChain([a, gone])).map((s) => s.path)).toEqual([a]);
  });

  test("rethrows a non-ENOENT error", async () => {
    const a = join(dir, "a.jsonl");
    await writeFile(a, "one\n");
    // A path whose parent component is a regular file: ENOTDIR, not ENOENT. Any
    // such failure must surface rather than silently shortening the chain.
    let caught: NodeJS.ErrnoException | undefined;
    try {
      await statChain([join(a, "nested.jsonl")]);
    } catch (err) {
      caught = err as NodeJS.ErrnoException;
    }
    expect(caught?.code).toBe("ENOTDIR");
  });

  test("signature moves on an append", async () => {
    const a = join(dir, "a.jsonl");
    await writeFile(a, "one\n");
    const before = await transcriptChainSignature([a]);

    await appendFile(a, "two\n");
    expect(await transcriptChainSignature([a])).not.toBe(before);
  });

  test("signature is stable when nothing moves", async () => {
    const a = join(dir, "a.jsonl");
    await writeFile(a, "one\n");
    expect(await transcriptChainSignature([a])).toBe(await transcriptChainSignature([a]));
  });

  test("signature moves when the chain grows", async () => {
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    await writeFile(a, "one\n");
    const before = await transcriptChainSignature([a]);

    await writeFile(b, "two\n");
    expect(await transcriptChainSignature([a, b])).not.toBe(before);
  });

  test("a vanished chain file still moves the signature", async () => {
    const a = join(dir, "a.jsonl");
    const b = join(dir, "b.jsonl");
    await writeFile(a, "one\n");
    await writeFile(b, "two\n");
    const before = await transcriptChainSignature([a, b]);

    await rm(b);
    expect(await transcriptChainSignature([a, b])).not.toBe(before);
  });

  test("an empty chain is \"none\"", async () => {
    expect(await transcriptChainSignature([])).toBe("none");
  });
});
