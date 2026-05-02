import { existsSync, readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import type { PluginNode, PublishTreePayload } from "../../shared/types";

const PLUGINS_ROOT = resolve(import.meta.dir, "..", "..", "..");

type Runtime = "web" | "server" | "central";
const RUNTIMES: Runtime[] = ["web", "server", "central"];

function readBarrel(dir: string, runtime: Runtime): string | null {
  const file = join(dir, runtime, "index.ts");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function parseStringField(src: string, field: string): string | undefined {
  // Matches `field: "..."` and `field: \`...\`` (single-line backticks).
  const dq = new RegExp(`\\b${field}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
  if (dq) return dq[1];
  const bt = new RegExp(`\\b${field}\\s*:\\s*\`((?:[^\`\\\\]|\\\\.)*)\``).exec(src);
  if (bt) return bt[1]!.replace(/\s+/g, " ").trim();
  return undefined;
}

function parseBoolField(src: string, field: string): boolean {
  const m = new RegExp(`\\b${field}\\s*:\\s*(true|false)\\b`).exec(src);
  return m?.[1] === "true";
}

function buildNode(dir: string, parentHierarchy: string): PluginNode | null {
  const sources: Partial<Record<Runtime, string>> = {};
  for (const r of RUNTIMES) {
    const src = readBarrel(dir, r);
    if (src) sources[r] = src;
  }
  if (!sources.web && !sources.server && !sources.central) return null;

  const rel = relative(PLUGINS_ROOT, dir).split("\\").join("/");
  const name = rel.split("/").pop()!;
  const hierarchyId = parentHierarchy ? `${parentHierarchy}.${name}` : name;

  const description =
    (sources.web && parseStringField(sources.web, "description")) ||
    (sources.server && parseStringField(sources.server, "description")) ||
    (sources.central && parseStringField(sources.central, "description"));

  const loadBearing = RUNTIMES.some(
    (r) => sources[r] && parseBoolField(sources[r]!, "loadBearing"),
  );

  const subPluginsDir = join(dir, "plugins");
  const children: PluginNode[] = [];
  if (existsSync(subPluginsDir)) {
    for (const entry of readdirSync(subPluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = buildNode(join(subPluginsDir, entry.name), hierarchyId);
      if (child) children.push(child);
    }
    children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    path: rel,
    name,
    hierarchyId,
    description,
    loadBearing,
    runtimes: {
      web: !!sources.web,
      server: !!sources.server,
      central: !!sources.central,
    },
    children,
  };
}

function tally(
  node: PluginNode,
  totals: { plugins: number; loadBearing: number; umbrellas: number },
) {
  totals.plugins += 1;
  if (node.loadBearing) totals.loadBearing += 1;
  if (node.children.length > 0) totals.umbrellas += 1;
  for (const child of node.children) tally(child, totals);
}

export function handleTree(): Response {
  const plugins: PluginNode[] = [];
  for (const entry of readdirSync(PLUGINS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const node = buildNode(join(PLUGINS_ROOT, entry.name), "");
    if (node) plugins.push(node);
  }
  plugins.sort((a, b) => a.name.localeCompare(b.name));

  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);

  const payload: PublishTreePayload = { plugins, totals };
  return Response.json(payload);
}
