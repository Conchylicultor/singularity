import {
  type Fiber,
  type FiberRoot,
  PerformedWork,
  FunctionComponent,
  ClassComponent,
  ForwardRef,
  SimpleMemoComponent,
  MemoComponent,
} from "./react-types";

/** Cap on how many ancestor names we keep for disambiguation (nearest-last). */
const ANCESTOR_PATH_CAP = 6;

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
}

/**
 * Iterative DFS over the committed tree. A component fiber is an INITIATOR iff
 * it rendered AND no ancestor component fiber rendered on its path — i.e. it is
 * the topmost rendered fiber along that path, so its re-render came from its own
 * state/context/subscription, not propagation. Once we pass through a rendered
 * component fiber, deeper renders on that path are propagation (we mark
 * `ancestorRendered` true for the subtree), but sibling subtrees keep their own
 * per-path flag, so multiple independent updates in one commit each surface.
 */
export function collectInitiators(
  root: FiberRoot,
): Array<{ fiber: Fiber; ancestorPath: string[] }> {
  const out: Array<{ fiber: Fiber; ancestorPath: string[] }> = [];
  const start = root?.current;
  if (!start) return out;

  // Explicit stack of per-path state — clearer and correct vs. return-pointer
  // bookkeeping for the "ancestor rendered" flag.
  const stack: StackEntry[] = [
    { fiber: start, ancestorRendered: false, path: [] },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const { fiber, ancestorRendered, path } = entry;

    let childAncestorRendered = ancestorRendered;
    let childPath = path;

    if (isComponentFiber(fiber)) {
      const name = getComponentName(fiber);
      if (didFiberRender(fiber)) {
        // First rendered component on this path is the initiator; deeper renders
        // are propagation. Either way, the subtree now has a rendered ancestor.
        if (!ancestorRendered) {
          out.push({ fiber, ancestorPath: path.slice(-ANCESTOR_PATH_CAP) });
        }
        childAncestorRendered = true;
      }
      // Extend the ancestor path for descendants with this component's name.
      childPath = path.concat(name);
      if (childPath.length > ANCESTOR_PATH_CAP * 2) {
        childPath = childPath.slice(-ANCESTOR_PATH_CAP * 2);
      }
    }

    // Push children (left-to-right order is irrelevant for aggregation).
    let child = fiber.child;
    while (child) {
      stack.push({
        fiber: child,
        ancestorRendered: childAncestorRendered,
        path: childPath,
      });
      child = child.sibling;
    }
  }

  return out;
}
