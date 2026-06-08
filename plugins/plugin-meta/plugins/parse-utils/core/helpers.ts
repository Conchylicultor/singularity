import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────

export interface BarrelExport {
  name: string;
  kind: "type" | "value";
}

// ── Helpers ────────────────────────────────────────────────────────

export function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const transpiler = new Bun.Transpiler({ loader: "ts" });

export function stripTypes(src: string): string {
  try {
    return transpiler.transformSync(src);
  } catch (err) {
    if (!(err instanceof SyntaxError) && !(err instanceof TypeError)) throw err;
    return src;
  }
}

export function parseStringField(src: string, field: string): string | undefined {
  const dq = new RegExp(`\\b${field}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
  if (dq) return dq[1];
  const bt = new RegExp(`\\b${field}\\s*:\\s*\`((?:[^\`\\\\]|\\\\.)*)\``).exec(src);
  if (bt) return bt[1]!.replace(/\s+/g, " ").trim();
  return undefined;
}

export function parseBoolField(src: string, field: string): boolean {
  const m = new RegExp(`\\b${field}\\s*:\\s*(true|false)\\b`).exec(src);
  return m?.[1] === "true";
}

export function matchBracket(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    // Skip comments before quote handling: a stray apostrophe or bracket inside a
    // `// ...` or `/* ... */` comment must not be treated as a string delimiter or
    // affect nesting depth (e.g. a comment mentioning a schema's row would
    // otherwise open an unterminated single-quote string and swallow the closer).
    if (c === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++; // sits on '/'; the loop's i++ steps past it
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseDefineGroup<T>(
  src: string,
  builder: "defineSlot" | "defineCommand" | "defineDispatchSlot",
  make: (memberName: string, id: string, groupName: string) => T,
): T[] {
  const out: T[] = [];
  const groupRe = /export\s+const\s+([A-Z]\w*)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(src))) {
    const groupName = m[1]!;
    const braceStart = src.indexOf("{", m.index);
    const braceEnd = matchBracket(src, braceStart, "{", "}");
    if (braceEnd < 0) continue;
    const body = src.slice(braceStart + 1, braceEnd);
    const memberRe = new RegExp(
      `([A-Z]\\w*)\\s*:\\s*${builder}\\s*\\(\\s*"([^"]+)"`,
      "g",
    );
    let mm: RegExpExecArray | null;
    while ((mm = memberRe.exec(body))) out.push(make(mm[1]!, mm[2]!, groupName));
  }
  return out;
}

export function parseBarrelExports(src: string): BarrelExport[] {
  const map = new Map<string, "type" | "value">();
  const setIfUnset = (name: string, kind: "type" | "value") => {
    if (!map.has(name)) map.set(name, kind);
  };

  const declRe =
    /export\s+(?!default\b)(?:async\s+)?(const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    const keyword = m[1]!;
    const name = m[2]!;
    const kind: "type" | "value" =
      keyword === "type" || keyword === "interface" ? "type" : "value";
    setIfUnset(name, kind);
  }

  const listRe = /export\s+(type\s+)?\{([^}]+)\}/g;
  while ((m = listRe.exec(src))) {
    const blockIsType = !!m[1];
    const inner = m[2]!;
    for (const raw of inner.split(",")) {
      let s = raw.trim();
      if (!s) continue;
      let itemIsType = false;
      if (/^type\s+/.test(s)) {
        itemIsType = true;
        s = s.replace(/^type\s+/, "");
      }
      const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      const name = asMatch ? asMatch[2]! : s;
      if (name === "default") continue;
      if (!/^\w+$/.test(name)) continue;
      const kind: "type" | "value" = blockIsType || itemIsType ? "type" : "value";
      setIfUnset(name, kind);
    }
  }

  return Array.from(map, ([name, kind]) => ({ name, kind })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "plugins") continue;
      walkFiles(p, out);
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
}
