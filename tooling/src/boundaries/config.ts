import type { AllowEdge, BoundaryConfig, DenyEdge, ZoneDefinition } from "./types";

export function zone(
  name: string,
  opts: Omit<ZoneDefinition, "name">,
): ZoneDefinition {
  return { name, ...opts };
}

function parseEdge(expr: string): { source: string; target: string } {
  const parts = expr.split("->").map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid edge expression: "${expr}" — expected "source -> target"`);
  }
  return { source: parts[0], target: parts[1] };
}

export function allow(expr: string): AllowEdge {
  return { kind: "allow", ...parseEdge(expr) };
}

export function deny(expr: string): DenyEdge {
  return { kind: "deny", ...parseEdge(expr) };
}

export function defineBoundaries(config: BoundaryConfig): BoundaryConfig {
  return config;
}
