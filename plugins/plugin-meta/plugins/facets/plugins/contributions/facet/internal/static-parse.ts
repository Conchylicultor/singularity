import { existsSync } from "fs";
import {
  matchBracket,
  walkFiles,
  readIfExists,
  parseStringField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// ── Types ──────────────────────────────────────────────────────────

export interface PaneDefinition {
  id: string;
  path?: string;
}

export interface ImportBinding {
  local: string;
  original: string;
  module: string;
}

// ── Helpers ────────────────────────────────────────────────────────

export function parseImports(src: string): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>();
  const namedRe = /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(src))) {
    const defLocal = m[1];
    const names = m[2]!;
    const mod = m[3]!;
    if (defLocal) map.set(defLocal, { local: defLocal, original: "default", module: mod });
    for (const raw of names.split(",")) {
      let s = raw.trim();
      if (!s) continue;
      s = s.replace(/^type\s+/, "");
      const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asMatch) map.set(asMatch[2]!, { local: asMatch[2]!, original: asMatch[1]!, module: mod });
      else if (/^\w+$/.test(s)) map.set(s, { local: s, original: s, module: mod });
    }
  }
  const defRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g;
  while ((m = defRe.exec(src))) map.set(m[1]!, { local: m[1]!, original: "default", module: m[2]! });
  return map;
}

export function extractContributionsBlock(src: string): string | null {
  const idx = src.search(/\bcontributions\s*:\s*\[/);
  if (idx < 0) return null;
  const start = src.indexOf("[", idx);
  const end = matchBracket(src, start, "[", "]");
  if (end < 0) return null;
  return src.slice(start + 1, end);
}

export function findCalls(block: string): { callee: string; argsBody: string }[] {
  const out: { callee: string; argsBody: string }[] = [];
  const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const callee = m[1]!;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchBracket(block, openIdx, "{", "}");
    if (closeIdx < 0) continue;
    out.push({ callee, argsBody: block.slice(openIdx + 1, closeIdx) });
  }
  return out;
}

export function parsePropsBlock(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const len = body.length;
  const skipWs = () => {
    while (i < len && /\s/.test(body[i]!)) i++;
  };
  const skipString = (quote: string) => {
    i++;
    while (i < len && body[i] !== quote) {
      if (body[i] === "\\") i++;
      i++;
    }
    i++;
  };
  const parseValue = (): string => {
    skipWs();
    if (i >= len) return "";
    const c = body[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      skipString(c);
      return body.slice(start, i);
    }
    if (c === "{" || c === "[") {
      const open = c;
      const close = c === "{" ? "}" : "]";
      const start = i;
      const end = matchBracket(body, i, open, close);
      i = end < 0 ? len : end + 1;
      return body.slice(start, i);
    }
    let depth = 0;
    const start = i;
    while (i < len) {
      const ch = body[i]!;
      if (depth === 0 && ch === ",") break;
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
      else if (ch === '"' || ch === "'" || ch === "`") {
        skipString(ch);
        continue;
      }
      i++;
    }
    return body.slice(start, i).trim();
  };
  while (i < len) {
    skipWs();
    const rest = body.slice(i);
    const keyMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest);
    if (!keyMatch) break;
    const key = keyMatch[1]!;
    i += keyMatch[0].length;
    const val = parseValue();
    out[key] = val;
    skipWs();
    if (body[i] === ",") i++;
  }
  return out;
}

export function parsePaneDefinitions(webDir: string): Map<string, PaneDefinition> {
  const out = new Map<string, PaneDefinition>();
  if (!existsSync(webDir)) return out;
  const files: string[] = [];
  walkFiles(webDir, files);
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*Pane\.define\s*\(\s*\{/g;
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const varName = m[1]!;
      const openIdx = m.index + m[0].length - 1;
      const closeIdx = matchBracket(src, openIdx, "{", "}");
      if (closeIdx < 0) continue;
      const body = src.slice(openIdx + 1, closeIdx);
      const id = parseStringField(body, "id");
      const path = parseStringField(body, "path") ?? parseStringField(body, "segment");
      if (id) out.set(varName, { id, path });
    }
  }
  return out;
}
