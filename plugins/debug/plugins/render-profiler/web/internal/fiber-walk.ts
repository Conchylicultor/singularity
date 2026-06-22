import {
  type Fiber,
  type FiberRoot,
  PerformedWork,
  FunctionComponent,
  ClassComponent,
  ForwardRef,
  SimpleMemoComponent,
  MemoComponent,
  HostComponent,
  Fragment,
} from "./react-types";

/** Cap on how many ancestor names we keep for disambiguation (nearest-last). */
const ANCESTOR_PATH_CAP = 6;

/** Cap on the recorded position map; on overflow we stop inserting and truncate. */
const POSITION_MAP_CAP = 20_000;

/**
 * Resolve a fiber's display name. Component-type fibers get their real name
 * (unwrapping forwardRef `.render` and memo `.type`); non-component fibers get
 * a tag label. Defensive property access — never throws on a weird shape.
 */
export function getComponentName(fiber: Fiber): string {
  const type = fiber.type;
  if (fiber.tag === ForwardRef) {
    const render = type?.render;
    return render?.displayName ?? render?.name ?? "ForwardRef";
  }
  if (fiber.tag === MemoComponent || fiber.tag === SimpleMemoComponent) {
    const inner = type?.type ?? type;
    return inner?.displayName ?? inner?.name ?? "Memo";
  }
  // A fragment's `type` is `Symbol(react.fragment)` — give it a real name so it
  // surfaces as `Fragment` (not `Unknown#7`) in element-type remount causes.
  if (fiber.tag === Fragment) return "Fragment";
  if (typeof type === "function" || typeof type === "object") {
    const name = type?.displayName ?? type?.name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  if (typeof type === "string") return type; // host element name (e.g. "div")
  return `Unknown#${fiber.tag}`;
}

/** True for fibers that run user component code (have hooks / can self-update). */
export function isComponentFiber(fiber: Fiber): boolean {
  switch (fiber.tag) {
    case FunctionComponent:
    case ClassComponent:
    case ForwardRef:
    case SimpleMemoComponent:
    case MemoComponent:
      return true;
    default:
      return false;
  }
}

/**
 * Did this fiber render this commit? Only meaningful for component fibers; the
 * `PerformedWork` flag is set when the component ran its render fn (not on
 * bailout) and survives into the committed tree.
 */
export function didFiberRender(fiber: Fiber): boolean {
  if (!isComponentFiber(fiber)) return false;
  return (fiber.flags & PerformedWork) !== 0;
}

interface StackEntry {
  fiber: Fiber;
  /** Whether any ancestor component fiber on THIS path rendered. */
  ancestorRendered: boolean;
  /** Component display names of ancestors on this path, nearest-last. */
  path: string[];
  /** Position key of the parent, so children build their own key on it. */
  parentPositionKey: string;
}

/** What a recorded position held last/this commit — its occupant identity. */
export interface PositionOccupant {
  name: string;
  key: string | null;
}

/** One initiator surfaced by the walk: the topmost rendered fiber on its path. */
export interface CommitInitiatorFiber {
  fiber: Fiber;
  ancestorPath: string[];
  /** True when the fiber freshly mounted this commit (`alternate === null`). */
  isMount: boolean;
}

/** One remount detected by diffing this commit's positions against the prev. */
export interface RemountDetection {
  positionKey: string;
  ancestorPath: string[];
  fromType: string;
  toType: string;
  cause: "element-type" | "key-change";
}

export interface CommitWalkResult {
  initiators: CommitInitiatorFiber[];
  /** Recorded occupants of positions inside rendered subtrees this commit. */
  currentPositions: Map<string, PositionOccupant>;
  remounts: RemountDetection[];
  /** True when `currentPositions` hit POSITION_MAP_CAP and stopped inserting. */
  truncated: boolean;
}

/** A position is worth recording only for component / host-element / fragment fibers. */
function isRecordablePosition(fiber: Fiber): boolean {
  return (
    isComponentFiber(fiber) ||
    fiber.tag === HostComponent ||
    fiber.tag === Fragment
  );
}

/**
 * Does any CURRENT sibling of `fiber` carry `key`? Used to tell a reorder (the
 * prev occupant moved to another slot and is still alive) from a true destroy
 * (the prev occupant's key is gone entirely). Walks `fiber.return.child` on
 * demand — no extra map, no fiber retention; only called on the rare mount path
 * when the prev occupant was keyed, so the scan is cheap.
 */
function siblingHasKey(fiber: Fiber, key: string): boolean {
  let c = fiber.return?.child ?? null;
  while (c) {
    if (c.key === key) return true;
    c = c.sibling;
  }
  return false;
}

/**
 * Iterative DFS over the committed tree. Two jobs in one pass:
 *
 * 1. **Initiators.** A component fiber is an INITIATOR iff it rendered AND no
 *    ancestor component fiber rendered on its path — i.e. it is the topmost
 *    rendered fiber along that path, so its re-render came from its own
 *    state/context/subscription, not propagation. Once we pass through a rendered
 *    component fiber, deeper renders on that path are propagation (we mark
 *    `ancestorRendered` true for the subtree), but sibling subtrees keep their
 *    own per-path flag, so multiple independent updates in one commit surface.
 *
 * 2. **Remounts.** Every fiber gets a purely **index-based** `positionKey`
 *    (`parent + "/i:" + fiber.index`) — React's authoritative per-parent slot.
 *    Positions *inside a rendered subtree* are recorded (with the occupant's
 *    `key`). A fiber with `alternate === null` (freshly mounted) at a slot the
 *    *previous* commit also occupied is a candidate remount; we then decide
 *    remount-vs-benign-reorder by asking whether the prev occupant was actually
 *    destroyed: if it was keyed and that key still appears among the new fiber's
 *    current siblings, it merely moved (suppress); otherwise it was rebuilt
 *    (remount). This catches BOTH causes with zero false positives — an
 *    index-only key would flag a list prepend, while a key-only key would miss
 *    identity-churning `key={uuid()}` remounts.
 */
export function collectCommit(
  root: FiberRoot,
  prevPositions: Map<string, PositionOccupant>,
): CommitWalkResult {
  const initiators: CommitInitiatorFiber[] = [];
  const currentPositions = new Map<string, PositionOccupant>();
  const remounts: RemountDetection[] = [];
  let truncated = false;

  const start = root?.current;
  if (!start) {
    return { initiators, currentPositions, remounts, truncated };
  }

  // Explicit stack of per-path state — clearer and correct vs. return-pointer
  // bookkeeping for the "ancestor rendered" flag.
  const stack: StackEntry[] = [
    { fiber: start, ancestorRendered: false, path: [], parentPositionKey: "" },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const { fiber, ancestorRendered, path, parentPositionKey } = entry;

    // Compute the position key for EVERY fiber so children can build on it.
    // Purely index-based (React's authoritative per-parent slot); the prev
    // occupant's key is stored separately for the reorder-vs-destroy decision.
    const positionKey = parentPositionKey + "/i:" + fiber.index;

    let childAncestorRendered = ancestorRendered;
    let childPath = path;

    if (isComponentFiber(fiber)) {
      const name = getComponentName(fiber);
      if (didFiberRender(fiber)) {
        // First rendered component on this path is the initiator; deeper renders
        // are propagation. Either way, the subtree now has a rendered ancestor.
        if (!ancestorRendered) {
          initiators.push({
            fiber,
            ancestorPath: path.slice(-ANCESTOR_PATH_CAP),
            isMount: fiber.alternate === null,
          });
        }
        childAncestorRendered = true;
      }
      // Extend the ancestor path for descendants with this component's name.
      childPath = path.concat(name);
      if (childPath.length > ANCESTOR_PATH_CAP * 2) {
        childPath = childPath.slice(-ANCESTOR_PATH_CAP * 2);
      }
    }

    // Only nodes inside a rendered subtree can have been destroyed/rebuilt this
    // commit (a remount needs its parent to have re-rendered).
    if (childAncestorRendered && isRecordablePosition(fiber)) {
      const name = getComponentName(fiber);
      // Detect a remount BEFORE recording the new occupant.
      if (fiber.alternate === null) {
        const prev = prevPositions.get(positionKey);
        // prev absent ⇒ genuinely new slot (list growth / first render) — a real
        // mount, not a remount.
        if (
          prev &&
          // If the prev occupant was keyed and its key still appears among the
          // current siblings, it merely moved/shifted (reused elsewhere), not
          // destroyed — suppress. This is what makes a keyed list prepend report
          // zero remounts.
          !(prev.key != null && siblingHasKey(fiber, prev.key))
        ) {
          // The prev occupant at this slot was destroyed and rebuilt.
          remounts.push({
            positionKey,
            ancestorPath: path.slice(-ANCESTOR_PATH_CAP),
            fromType: prev.name,
            toType: name,
            // Different element type ⇒ element-type flip; same type ⇒ the
            // identity changed (key churn / unkeyed sibling replacement).
            cause: prev.name !== name ? "element-type" : "key-change",
          });
        }
      }
      if (currentPositions.size < POSITION_MAP_CAP) {
        currentPositions.set(positionKey, { name, key: fiber.key });
      } else {
        truncated = true;
      }
    }

    // Push children (left-to-right order is irrelevant for aggregation).
    let child = fiber.child;
    while (child) {
      stack.push({
        fiber: child,
        ancestorRendered: childAncestorRendered,
        path: childPath,
        parentPositionKey: positionKey,
      });
      child = child.sibling;
    }
  }

  return { initiators, currentPositions, remounts, truncated };
}
