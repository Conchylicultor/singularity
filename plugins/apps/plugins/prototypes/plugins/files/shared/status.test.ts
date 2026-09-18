import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STATUS_DIR_NAME, openStatusStore, type StatusStore } from "./status";

// The status store against a throwaway prototypes tree. The file layout, lock
// and atomic write are the shared record store's, pinned by `picks.test.ts`;
// this pins what is particular to a status, and `readAll`.

const ID = "proto-1789000000-abcd";
const OTHER = "proto-1789000001-wxyz";

let root: string;
let store: StatusStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "prototype-status-"));
  store = openStatusStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("openStatusStore", () => {
  test("no file is not done, and readAll is empty", async () => {
    expect(await store.read(ID)).toEqual({ done: false });
    expect(await store.readAll()).toEqual({});
  });

  test("marking done writes the file under _status/; unmarking removes it", async () => {
    expect(await store.write(ID, { done: true })).toEqual({ done: true });
    expect(store.fileOf(ID)).toBe(join(root, STATUS_DIR_NAME, `${ID}.json`));
    expect(existsSync(store.fileOf(ID))).toBe(true);

    expect(await store.write(ID, { done: false })).toEqual({ done: false });
    expect(existsSync(store.fileOf(ID))).toBe(false);
  });

  test("readAll keys every recorded status by id, skipping foreign files", async () => {
    await store.write(ID, { done: true });
    await store.write(OTHER, { done: true });
    await writeFile(join(root, STATUS_DIR_NAME, "notes.json"), "{}");
    expect(await store.readAll()).toEqual({
      [ID]: { done: true },
      [OTHER]: { done: true },
    });
  });

  test("a malformed file throws from readAll — never read as not done", async () => {
    await mkdir(join(root, STATUS_DIR_NAME), { recursive: true });
    await writeFile(store.fileOf(ID), '{"done": "yes"}');
    let message = "";
    try {
      await store.readAll();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("malformed prototype status file");
  });
});
