import { describe, expect, test } from "bun:test";
import {
  getCursorBeat,
  setCursorBeat,
  subscribeCursor,
} from "./cursor-store";

/**
 * The cursor store is a module-level singleton, so each test seeds an explicit
 * starting beat rather than assuming a fresh module. We exercise only the pure
 * read/write/subscribe surface here; the React hooks (`useCursorBeat`,
 * `useCursorSelector`) are covered by runtime verification of the Sonata player.
 */
describe("cursor-store", () => {
  test("setCursorBeat updates the snapshot", () => {
    setCursorBeat(10, { seek: true });
    expect(getCursorBeat()).toBe(10);
    setCursorBeat(12.5);
    expect(getCursorBeat()).toBe(12.5);
  });

  test("a real advance notifies subscribers with seek=false", () => {
    setCursorBeat(0, { seek: true });
    const seen: boolean[] = [];
    const unsub = subscribeCursor((seek) => seen.push(seek));
    setCursorBeat(1);
    setCursorBeat(2);
    unsub();
    expect(seen).toEqual([false, false]);
    expect(getCursorBeat()).toBe(2);
  });

  test("an unchanged beat is deduped (no notification) unless it's a seek", () => {
    setCursorBeat(5, { seek: true });
    let calls = 0;
    const unsub = subscribeCursor(() => calls++);
    setCursorBeat(5); // same beat, not a seek → deduped
    expect(calls).toBe(0);
    setCursorBeat(5, { seek: true }); // same beat, but a seek → still fires
    expect(calls).toBe(1);
    unsub();
  });

  test("a seek notifies with seek=true", () => {
    setCursorBeat(0, { seek: true });
    const seen: boolean[] = [];
    const unsub = subscribeCursor((seek) => seen.push(seek));
    setCursorBeat(100, { seek: true });
    unsub();
    expect(seen).toEqual([true]);
  });

  test("unsubscribe stops notifications", () => {
    setCursorBeat(0, { seek: true });
    let calls = 0;
    const unsub = subscribeCursor(() => calls++);
    setCursorBeat(1);
    unsub();
    setCursorBeat(2);
    expect(calls).toBe(1);
  });
});
