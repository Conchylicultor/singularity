import { describe, expect, it } from "bun:test";
import { loadCollectedDir, type CollectedEntry } from "./load-collected-dir";

const isString = (v: unknown): v is string => typeof v === "string";

function entry(
  pluginPath: string,
  loader: CollectedEntry["loader"],
): CollectedEntry {
  return { pluginPath, id: pluginPath, loader, dependsOn: [] };
}

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test, so awaiting it
 * is an `await` of a non-Thenable (same helper as the inflight suite).
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

describe("loadCollectedDir isPresent", () => {
  it("skips a stale entry under strict without loading it", async () => {
    let loadedStale = false;
    const items = await loadCollectedDir(
      [
        entry("kept", () => Promise.resolve({ default: "a" })),
        entry("deleted", () => {
          loadedStale = true;
          return Promise.reject(new Error("Cannot find module"));
        }),
      ],
      {
        isItem: isString,
        strict: true,
        isPresent: (e) => e.pluginPath !== "deleted",
      },
    );
    expect(items).toEqual(["a"]);
    expect(loadedStale).toBe(false);
  });

  it("still fails strict on a present entry whose loader throws", async () => {
    const err = await rejection(
      loadCollectedDir(
        [entry("broken", () => Promise.reject(new Error("boom")))],
        { isItem: isString, strict: true, isPresent: () => true },
      ),
    );
    expect(err.message).toContain("broken — loader threw: boom");
  });

  it("still fails strict on a present entry with no default export", async () => {
    const err = await rejection(
      loadCollectedDir(
        [entry("empty", () => Promise.resolve({ default: undefined }))],
        { isItem: isString, strict: true, isPresent: () => true },
      ),
    );
    expect(err.message).toContain("empty — no default export");
  });
});
