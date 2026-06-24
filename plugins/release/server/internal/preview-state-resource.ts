import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
// `key` / `schema` are the shared client descriptor's; an external resource's
// truth lives outside Postgres (an in-memory Map here), so it keeps a callable
// `notify()` — the only way to push when the in-memory state changes.
import { previewStateResource as previewStateDescriptor, type Preview } from "../../core/resources";

// The in-memory preview registry, keyed by runId. The server projects this into
// the `release.previews` resource payload (a `Record<runId, Preview>`); the
// preview manager mutates it and calls `previewStateResource.notify()`.
export interface PreviewEntry {
  runId: string;
  pid: number;
  port: number;
  // The per-instance Postgres TCP port handed to this preview's embedded cluster
  // (SINGULARITY_PG_PORT). Kept so teardown can backstop-kill the PG listener.
  pgPort: number;
  url: string;
  dataRoot: string;
  status: "running" | "stopped";
}

export const previews = new Map<string, PreviewEntry>();

function snapshot(): Record<string, Preview> {
  const out: Record<string, Preview> = {};
  for (const [runId, p] of previews) {
    out[runId] = { runId, status: p.status, port: p.port, url: p.url };
  }
  return out;
}

export const previewStateResource = defineExternalResource({
  key: previewStateDescriptor.key,
  mode: "push",
  schema: previewStateDescriptor.schema,
  loader: () => snapshot(),
});
