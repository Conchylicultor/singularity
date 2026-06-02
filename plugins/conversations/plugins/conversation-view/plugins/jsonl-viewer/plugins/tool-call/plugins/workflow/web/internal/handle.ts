// The placeholder "handle" returned by the traced agent()/parallel()/pipeline()
// mocks. It stands in for an agent's (unknown) result so the script's real
// control flow can execute. Two jobs:
//   1. String coercion yields a unique sentinel. Scanning a recorded prompt for
//      sentinels reconstructs the data-flow edges between nodes — no AST needed.
//   2. Every trap returns something usable and NEVER throws. An operation we
//      can't model precisely (iterating an unknown-size collection) degrades to
//      a single representative element and flags the graph as `dynamic`.

// A distinctive printable token (not a control char, so it's git/tooling-safe)
// that is exceedingly unlikely to appear verbatim in a real prompt.
const SENTINEL_RE = /__WFREF_(n\d+)__/g;

export function nodeSentinel(nodeId: string): string {
  return `__WFREF_${nodeId}__`;
}

/** Node ids referenced (via sentinels) in a recorded string. */
export function extractDeps(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(SENTINEL_RE)) ids.add(m[1]!);
  return [...ids];
}

/** Rewrite sentinels to «label» for a human-readable prompt. */
export function resolveSentinels(
  text: string,
  labelOf: (nodeId: string) => string,
): string {
  return text.replace(SENTINEL_RE, (_full, id: string) => `«${labelOf(id)}»`);
}

export interface HandleEnv {
  /** Called whenever a handle is iterated over an unknown-size collection. */
  markDynamic: () => void;
}

// Array methods scripts realistically call on an agent result (e.g.
// `result.findings.map(...)`). All degrade to a single representative element.
const ARRAY_METHODS = new Set([
  "map", "flatMap", "filter", "forEach", "reduce", "reduceRight",
  "find", "findIndex", "some", "every", "includes", "join",
  "slice", "concat", "flat", "sort", "reverse", "at", "indexOf",
]);

export function makeHandle(nodeId: string, env: HandleEnv): unknown {
  const sentinel = nodeSentinel(nodeId);
  const childCache = new Map<string | symbol, unknown>();
  // Function target so the handle is callable and constructible without throwing.
  const target = function handleTarget() {};

  const handler: ProxyHandler<typeof target> = {
    get(_t, prop) {
      switch (prop) {
        case Symbol.toPrimitive:
        case "toString":
        case "valueOf":
        case "toJSON":
          // Always return the string sentinel, even for the "number" hint, so
          // numeric coercion yields NaN (false comparisons) rather than throwing.
          return () => sentinel;
        case "then":
        case "catch":
        case "finally":
          // Non-thenable: agent()/parallel() return real Promises, so chaining
          // happens on those. `await <handle>` resolves to the handle itself.
          return undefined;
        case Symbol.iterator:
        case Symbol.asyncIterator:
          // Spread / destructure / for-of yield nothing.
          return function* emptyIterator() {};
        case "length":
          return 0;
      }
      if (typeof prop === "string" && ARRAY_METHODS.has(prop)) {
        return (...args: unknown[]) => arrayMethod(prop, args, nodeId, env);
      }
      // Chained member access → child handle bound to the SAME node id, so a
      // downstream `${foundation.summary}` still resolves to the foundation node.
      const cached = childCache.get(prop);
      if (cached !== undefined) return cached;
      const child = makeHandle(nodeId, env);
      childCache.set(prop, child);
      return child;
    },
    apply() {
      return makeHandle(nodeId, env);
    },
    construct() {
      return makeHandle(nodeId, env) as object;
    },
    has() {
      return false;
    },
    ownKeys() {
      return [];
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
    set() {
      return true;
    },
    defineProperty() {
      return true;
    },
    deleteProperty() {
      return true;
    },
  };

  return new Proxy(target, handler);
}

function arrayMethod(
  name: string,
  args: unknown[],
  nodeId: string,
  env: HandleEnv,
): unknown {
  env.markDynamic();
  const cb =
    typeof args[0] === "function"
      ? (args[0] as (...a: unknown[]) => unknown)
      : null;
  const elem = makeHandle(nodeId, env);

  switch (name) {
    case "forEach":
      if (cb) cb(elem, 0, []);
      return undefined;
    case "map":
    case "flatMap":
      // Run the callback once with a representative element. Callbacks that call
      // agent() record one representative node; callbacks that build a thunk
      // (`() => agent()`) defer to parallel/pipeline, which records there.
      return [cb ? cb(elem, 0, []) : elem];
    case "filter":
      if (cb) cb(elem, 0, []);
      return [elem];
    case "reduce":
    case "reduceRight": {
      const init = args.length > 1 ? args[1] : elem;
      return cb ? cb(init, elem, 0, []) : init;
    }
    case "find":
    case "at":
      return elem;
    case "join":
      // String() triggers the sentinel, so an interpolated `xs.join('\n')`
      // still carries one dependency edge.
      return String(elem);
    case "some":
    case "includes":
      return false;
    case "every":
      return true;
    case "findIndex":
    case "indexOf":
      return -1;
    case "slice":
    case "concat":
    case "flat":
    case "sort":
    case "reverse":
      return [elem];
    default:
      return [elem];
  }
}
