import { describe, expect, test } from "bun:test";
import {
  PerformedWork,
  FunctionComponent,
  HostComponent,
  Fragment as FragmentTag,
  type Fiber,
  type FiberRoot,
} from "./react-types";
import { collectCommit, type PositionOccupant } from "./fiber-walk";

// ---- Minimal fiber fabrication --------------------------------------------
//
// Plain objects matching the `Fiber` interface, with only the fields the walk
// reads. `rendered` sets the PerformedWork flag; `mounted` sets `alternate`
// (null = freshly mounted this commit, a truthy object = reused in place).

interface FiberSpec {
  tag: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture mirrors React's loose `type`
  type: any;
  key?: string | null;
  index?: number;
  /** Component fiber that ran its render fn this commit (PerformedWork). */
  rendered?: boolean;
  /** false ⇒ freshly mounted (alternate === null); true ⇒ reused in place. */
  mounted?: boolean;
  children?: Fiber[];
}

function fib(spec: FiberSpec): Fiber {
  const fiber: Fiber = {
    tag: spec.tag,
    type: spec.type,
    key: spec.key ?? null,
    index: spec.index ?? 0,
    flags: spec.rendered ? PerformedWork : 0,
    memoizedState: null,
    memoizedProps: null,
    dependencies: null,
    child: null,
    sibling: null,
    return: null,
    // Reused fibers have a (truthy) alternate; freshly mounted ones do not.
    alternate: spec.mounted ? ({} as Fiber) : null,
  };
  // Wire children as a child/sibling chain with their parent return pointer.
  const kids = spec.children ?? [];
  let prev: Fiber | null = null;
  for (const kid of kids) {
    kid.return = fiber;
    if (prev === null) fiber.child = kid;
    else prev.sibling = kid;
    prev = kid;
  }
  return fiber;
}

function rootOf(top: Fiber): FiberRoot {
  return { current: top };
}

// A named function component "type" — getComponentName reads `.name`.
function comp(name: string) {
  const fn = function () {
    return null;
  };
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

const A = comp("A");
const B = comp("B");
const X = comp("X");

/** Two-pass diff: walk prev to seed positions, then walk current against them. */
function diff(prevTop: Fiber, currTop: Fiber) {
  const pass1 = collectCommit(rootOf(prevTop), new Map());
  const prev: Map<string, PositionOccupant> = pass1.currentPositions;
  return collectCommit(rootOf(currTop), prev);
}

describe("remount detection", () => {
  test("cond ? <A/> : <B/> toggle ⇒ one element-type remount A→B", () => {
    // A rendered parent component holding a single unkeyed component child.
    const prev = fib({
      tag: FunctionComponent,
      type: comp("Parent"),
      rendered: true,
      mounted: true,
      children: [fib({ tag: FunctionComponent, type: A, index: 0, mounted: true })],
    });
    const curr = fib({
      tag: FunctionComponent,
      type: comp("Parent"),
      rendered: true,
      mounted: true,
      // B freshly mounts at the same unkeyed slot (index 0) — alternate null.
      children: [fib({ tag: FunctionComponent, type: B, index: 0, mounted: false })],
    });

    const { remounts } = diff(prev, curr);
    expect(remounts).toHaveLength(1);
    expect(remounts[0]).toMatchObject({
      fromType: "A",
      toType: "B",
      cause: "element-type",
    });
  });

  test("keyed list prepend [A,B] → [X,A,B] ⇒ ZERO remounts", () => {
    const prev = fib({
      tag: FunctionComponent,
      type: comp("List"),
      rendered: true,
      mounted: true,
      children: [
        fib({ tag: FunctionComponent, type: A, key: "a", index: 0, mounted: true }),
        fib({ tag: FunctionComponent, type: B, key: "b", index: 1, mounted: true }),
      ],
    });
    const curr = fib({
      tag: FunctionComponent,
      type: comp("List"),
      rendered: true,
      mounted: true,
      children: [
        // X is genuinely new (fresh key-slot) — a mount, not a remount.
        fib({ tag: FunctionComponent, type: X, key: "x", index: 0, mounted: false }),
        // A/B keep their key-slots and are reused in place (alternate present).
        fib({ tag: FunctionComponent, type: A, key: "a", index: 1, mounted: true }),
        fib({ tag: FunctionComponent, type: B, key: "b", index: 2, mounted: true }),
      ],
    });

    const { remounts } = diff(prev, curr);
    expect(remounts).toHaveLength(0);
  });

  test("<>{x}</> → <div>{x}</div> ⇒ remount Fragment→div", () => {
    const prev = fib({
      tag: FunctionComponent,
      type: comp("Wrap"),
      rendered: true,
      mounted: true,
      children: [
        fib({ tag: FragmentTag, type: Symbol("react.fragment"), index: 0, mounted: true }),
      ],
    });
    const curr = fib({
      tag: FunctionComponent,
      type: comp("Wrap"),
      rendered: true,
      mounted: true,
      children: [
        // The unkeyed slot 0 flips from a fragment to a host <div>, freshly mounted.
        fib({ tag: HostComponent, type: "div", index: 0, mounted: false }),
      ],
    });

    const { remounts } = diff(prev, curr);
    expect(remounts).toHaveLength(1);
    expect(remounts[0]).toMatchObject({
      fromType: "Fragment",
      toType: "div",
      cause: "element-type",
    });
  });

  test("[Foo(v1)] → [Foo(v2)] (key churn, old destroyed) ⇒ key-change remount", () => {
    // The classic `key={uuid()}` bug: same component, new key each commit. The
    // old key is gone from the current siblings, so the slot was truly rebuilt.
    const prev = fib({
      tag: FunctionComponent,
      type: comp("Keyed"),
      rendered: true,
      mounted: true,
      children: [fib({ tag: FunctionComponent, type: A, key: "v1", index: 0, mounted: true })],
    });
    const curr = fib({
      tag: FunctionComponent,
      type: comp("Keyed"),
      rendered: true,
      mounted: true,
      // Same component A, same slot (index 0), new key — freshly mounted, and v1
      // is NOT among current siblings (only v2 exists) ⇒ genuine destroy/rebuild.
      children: [fib({ tag: FunctionComponent, type: A, key: "v2", index: 0, mounted: false })],
    });

    const { remounts } = diff(prev, curr);
    expect(remounts).toHaveLength(1);
    expect(remounts[0]).toMatchObject({
      fromType: "A",
      toType: "A",
      cause: "key-change",
    });
  });

  test("keyed reorder [A,B] → [B,A] (all reused) ⇒ ZERO remounts", () => {
    const prev = fib({
      tag: FunctionComponent,
      type: comp("List"),
      rendered: true,
      mounted: true,
      children: [
        fib({ tag: FunctionComponent, type: A, key: "a", index: 0, mounted: true }),
        fib({ tag: FunctionComponent, type: B, key: "b", index: 1, mounted: true }),
      ],
    });
    const curr = fib({
      tag: FunctionComponent,
      type: comp("List"),
      rendered: true,
      mounted: true,
      // Both reused in place (alternate present) — a pure reorder, no mounts at all.
      children: [
        fib({ tag: FunctionComponent, type: B, key: "b", index: 0, mounted: true }),
        fib({ tag: FunctionComponent, type: A, key: "a", index: 1, mounted: true }),
      ],
    });

    const { remounts } = diff(prev, curr);
    expect(remounts).toHaveLength(0);
  });
});
