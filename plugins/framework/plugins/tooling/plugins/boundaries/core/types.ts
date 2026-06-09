import type { RuntimeFolder } from "@plugins/framework/plugins/plugin-id/core";

export interface ZoneDefinition {
  name: string;
  match: string;
  discover?: "plugin-tree";
}

export interface AllowEdge {
  kind: "allow";
  source: string;
  target: string;
}

export interface DenyEdge {
  kind: "deny";
  source: string;
  target: string;
}

export type Edge = AllowEdge | DenyEdge;

export type RuntimeName = "web" | "server" | "central" | "shared";

export interface BoundaryConfig {
  zones: ZoneDefinition[];

  /** Which runtimes each runtime can import from. Default-deny: unlisted = blocked. */
  runtimes: Record<RuntimeFolder, RuntimeFolder[]>;

  /** Specific full-zone pairs that bypass the runtime check. "source.runtime -> target.runtime" */
  runtimeExceptions?: string[];

  /** Zone-level edges (no runtime suffixes). First-match, default-deny. */
  edges: Edge[];

  /** Files excluded from boundary checks (composition roots). */
  exclude?: string[];
}
