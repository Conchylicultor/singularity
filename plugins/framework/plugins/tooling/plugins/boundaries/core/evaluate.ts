import type { PluginFolder } from "@plugins/framework/plugins/plugin-id/core";
import type { BoundaryConfig, Edge } from "./types";
import { matchZone } from "./match";

export type EdgeResult = "allow" | "deny" | "default-deny";

export function evaluateEdges(
  edges: Edge[],
  sourceZone: string,
  targetZone: string,
): EdgeResult {
  for (const edge of edges) {
    if (
      matchZone(edge.source, sourceZone) &&
      matchZone(edge.target, targetZone)
    ) {
      return edge.kind;
    }
  }
  return "default-deny";
}

export function checkRuntime(
  folders: BoundaryConfig["folders"],
  source: PluginFolder,
  target: PluginFolder,
): boolean {
  // Widened so a leaf target is a legal argument (and always false).
  const allowed: readonly PluginFolder[] = folders[source];
  return allowed.includes(target);
}

export function isRuntimeException(
  exceptions: Set<string>,
  sourceZone: string,
  source: PluginFolder,
  targetZone: string,
  target: PluginFolder,
): boolean {
  return exceptions.has(`${sourceZone}.${source}\0${targetZone}.${target}`);
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
