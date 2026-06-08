import { walkFiles, readIfExists, findMarkerCalls, parseStringField } from "@plugins/plugin-meta/plugins/parse-utils/core";
import type { ResourceDef } from "../core";

export function parseResources(serverDir: string): ResourceDef[] {
  const files: string[] = [];
  walkFiles(serverDir, files);
  const out: { key: string; mode: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    for (const call of findMarkerCalls(src, "defineResource")) {
      // argsText is the `(…)` interior — for the canonical call shape this is the
      // `{ … }` object literal; parseStringField finds the fields within it.
      const body = call.argsText;
      const key = parseStringField(body, "key");
      const mode = parseStringField(body, "mode") ?? "push";
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push({ key, mode });
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
