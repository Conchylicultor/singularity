import { walkFiles, readIfExists, matchBracket, parseStringField } from "@plugins/plugin-meta/plugins/parse-utils/core";
import type { ResourceDef } from "../core";

export function parseResources(serverDir: string): ResourceDef[] {
  const files: string[] = [];
  walkFiles(serverDir, files);
  const out: { key: string; mode: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    const re = /defineResource\s*\(\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const openIdx = m.index + m[0].length - 1;
      const closeIdx = matchBracket(src, openIdx, "{", "}");
      if (closeIdx < 0) continue;
      const body = src.slice(openIdx + 1, closeIdx);
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
