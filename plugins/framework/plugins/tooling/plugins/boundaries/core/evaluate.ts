import type { Edge } from "./types";
import { matchZone } from "./match";

export type EdgeResult = "allow" | "deny" | "default-deny";

export function evaluateEdges(
  edges: Edge[],
  sourceZone: string,
  targetZone: string,
): EdgeResult {
  for (const edge of edges) {
    if (matchZone(edge.source, sourceZone) && matchZone(edge.target, targetZone)) {
      return edge.kind;
    }
  }
  return "default-deny";
}

export function checkRuntime(
  runtimes: Record<string, string[]>,
  sourceRuntime: string | null,
  targetRuntime: string | null,
): boolean {
  if (!sourceRuntime || !targetRuntime) return true;
  const allowed = runtimes[sourceRuntime];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!allowed) return false;
  return allowed.includes(targetRuntime);
}

export function isRuntimeException(
  exceptions: Set<string>,
  sourceZone: string,
  sourceRuntime: string | null,
  targetZone: string,
  targetRuntime: string | null,
): boolean {
  if (!sourceRuntime || !targetRuntime) return false;
  const fullSource = `${sourceZone}.${sourceRuntime}`;
  const fullTarget = `${targetZone}.${targetRuntime}`;
  return exceptions.has(`${fullSource}\0${fullTarget}`);
}

export function detectCycle(
  edges: { from: string; to: string }[],
): string[] | null {
  const adj = new Map<string, Set<string>>();
  const nodes = new Set<string>();
  for (const { from, to } of edges) {
    nodes.add(from);
    nodes.add(to);
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const node of nodes) {
    if (color.get(node) !== undefined) continue;
    const stack: { node: string; iter: Iterator<string> }[] = [
      { node, iter: (adj.get(node) ?? new Set<string>()).values() },
    ];
    color.set(node, GRAY);

    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const step = top.iter.next();
      if (step.done) {
        color.set(top.node, BLACK);
        stack.pop();
        continue;
      }
      const nxt = step.value;
      const col = color.get(nxt) ?? WHITE;
      if (col === GRAY) {
        const path = [top.node];
        let cur = top.node;
        while (cur !== nxt) {
          const par = parent.get(cur);
          if (par === undefined) break;
          path.push(par);
          cur = par;
        }
        path.push(nxt);
        path.reverse();
        return path;
      }
      if (col === WHITE) {
        color.set(nxt, GRAY);
        parent.set(nxt, top.node);
        stack.push({
          node: nxt,
          iter: (adj.get(nxt) ?? new Set<string>()).values(),
        });
      }
    }
  }

  return null;
}
