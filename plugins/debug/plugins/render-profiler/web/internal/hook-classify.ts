import type { HookChange, HookKind } from "../../core";
import type { Fiber } from "./react-types";

// React hook node in the `memoizedState` linked list. Shapes vary by hook type;
// all fields optional, accessed defensively (never throw on a weird shape).
interface HookNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal: value/effect/[value,deps]/{current}
  memoizedState?: any;
  queue?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal
    lastRenderedReducer?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal
    dispatch?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal
    pending?: any;
    getSnapshot?: unknown;
  } | null;
  next?: HookNode | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Classify a single hook node by its memoizedState/queue shape. */
function classifyKind(hook: HookNode): HookKind {
  const queue = hook.queue;
  if (queue && typeof queue.getSnapshot === "function") {
    return "external-store"; // useSyncExternalStore
  }
  if (
    queue &&
    ("lastRenderedReducer" in queue ||
      "dispatch" in queue ||
      "pending" in queue)
  ) {
    // useState / useReducer share the queue shape; we cannot reliably split them.
    return "state";
  }
  const ms = hook.memoizedState;
  if (isPlainObject(ms)) {
    // Effect node: { tag: number, create: fn, deps }.
    if (typeof ms.create === "function" && typeof ms.tag === "number") {
      return "effect"; // passive vs. layout not reliably separable post-commit
    }
    // Ref: an object whose only own key is `current`.
    const keys = Object.keys(ms);
    if (keys.length === 1 && keys[0] === "current") {
      return "ref";
    }
  }
  // useMemo / useCallback: [value, deps] where deps is an array or null.
  if (
    Array.isArray(ms) &&
    ms.length === 2 &&
    (Array.isArray(ms[1]) || ms[1] === null)
  ) {
    return "memo";
  }
  return "unknown";
}

/** A hook kind drives a re-render only if its committed value can change. */
function kindCanDriveRender(kind: HookKind): boolean {
  return kind === "state" || kind === "reducer" || kind === "external-store";
}

/**
 * Classify every hook of `fiber`, diffing against its `alternate` (previous
 * commit) in lockstep. Returns ALL entries (so indices line up); the session
 * filters to `changed === true`. Hook indices come first (linked-list order),
 * then context dependencies are numbered after.
 */
export function classifyHookChanges(fiber: Fiber): HookChange[] {
  const out: HookChange[] = [];

  let cur: HookNode | null = (fiber.memoizedState as HookNode | null) ?? null;
  let alt: HookNode | null =
    (fiber.alternate?.memoizedState as HookNode | null) ?? null;
  let index = 0;

  while (cur) {
    const kind = classifyKind(cur);
    // Only state/reducer/external-store changes drive renders; effects/memo/
    // callback/ref still emit (changed=false) so indices stay accurate.
    const changed = kindCanDriveRender(kind)
      ? cur.memoizedState !== alt?.memoizedState
      : false;
    out.push({ index, kind, changed });
    cur = cur.next ?? null;
    alt = alt?.next ?? null;
    index += 1;
  }

  // Context dependencies live on `fiber.dependencies`, not the hook list.
  // Number them continuing after the hook indices.
  let ctx = fiber.dependencies?.firstContext ?? null;
  let altCtx = fiber.alternate?.dependencies?.firstContext ?? null;
  while (ctx) {
    const changed = ctx.memoizedValue !== altCtx?.memoizedValue;
    out.push({ index, kind: "context", changed });
    ctx = ctx.next;
    altCtx = altCtx?.next ?? null;
    index += 1;
  }

  return out;
}
