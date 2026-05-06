import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, join, relative } from "path";

// ── Public types ────────────────────────────────────────────────────

export type Runtime = "web" | "server" | "central";

export interface BarrelExport {
  name: string;
  kind: "type" | "value";
}

export interface SlotDef {
  memberName: string;
  slotId: string;
  groupName: string;
}

export interface CommandDef {
  memberName: string;
  commandId: string;
  groupName: string;
}

export interface Contribution {
  slot: string;
  props: Record<string, string>;
  paneId?: string;
  panePath?: string;
}

export interface RuntimeDetail {
  httpRoutes: string[];
  wsRoutes: string[];
  resources: { key: string; mode: string }[];
  registerTokens: string[];
  apiUses: string[];
}

export interface EntityExtension {
  parentPlugin: string;
  extName: string;
  tableName: string;
}

export interface EntityExtensionRef {
  childPlugin: string;
  extName: string;
  tableName: string;
}

export interface PluginNode {
  dir: string;
  path: string;
  name: string;
  hierarchyId: string;
  description?: string;
  descriptions: Partial<Record<Runtime, string>>;
  loadBearing: boolean;
  runtimes: Record<Runtime, boolean>;
  children: PluginNode[];

  exports: Record<Runtime | "shared", BarrelExport[]>;
  slots: SlotDef[];
  commands: CommandDef[];
  contributions: Contribution[];
  server: RuntimeDetail;
  central: RuntimeDetail;
  dbFiles: string[];

  importedBy: string[];
  slotContributors: string[];
  endpointCallers: string[];
  entityExtensions: EntityExtension[];
  extendedBy: EntityExtensionRef[];
}

export interface PluginTree {
  pluginsRoot: string;
  byDir: Map<string, PluginNode>;
  roots: PluginNode[];
}

// ── Internal types ──────────────────────────────────────────────────

interface PaneDefinition {
  id: string;
  path?: string;
}

interface ImportBinding {
  local: string;
  original: string;
  module: string;
}

interface RawExtRef {
  parentVarName: string;
  parentModule: string;
  extName: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const transpiler = new Bun.Transpiler({ loader: "ts" });

function stripTypes(src: string): string {
  try {
    return transpiler.transformSync(src);
  } catch {
    return src;
  }
}

function parseStringField(src: string, field: string): string | undefined {
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

function matchBracket(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
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

function parseDefineGroup<T>(
  src: string,
  builder: "defineSlot" | "defineCommand",
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

function parseImports(src: string): Map<string, ImportBinding> {
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

function extractContributionsBlock(src: string): string | null {
  const idx = src.search(/\bcontributions\s*:\s*\[/);
  if (idx < 0) return null;
  const start = src.indexOf("[", idx);
  const end = matchBracket(src, start, "[", "]");
  if (end < 0) return null;
  return src.slice(start + 1, end);
}

function findCalls(block: string): { callee: string; argsBody: string }[] {
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

function parsePropsBlock(body: string): Record<string, string> {
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

function parseRouteMap(src: string, field: "httpRoutes" | "wsRoutes"): string[] {
  const idx = src.search(new RegExp(`\\b${field}\\s*:\\s*\\{`));
  if (idx < 0) return [];
  const start = src.indexOf("{", idx);
  const end = matchBracket(src, start, "{", "}");
  if (end < 0) return [];
  const body = src.slice(start + 1, end);
  const keys: string[] = [];
  const re = /"([^"]+)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) keys.push(m[1]!);
  return keys;
}

function parseBarrelExports(src: string): BarrelExport[] {
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

function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
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

function parsePaneDefinitions(webDir: string): Map<string, PaneDefinition> {
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
      const path = parseStringField(body, "path");
      if (id) out.set(varName, { id, path });
    }
  }
  return out;
}

function parseServerApiUses(serverDir: string, selfName: string, runtime: "server" | "central" = "server"): string[] {
  const files: string[] = [];
  walkFiles(serverDir, files);
  const uses = new Set<string>();
  const modRe = new RegExp(`@plugins\\/([^/"'\`]+)\\/${runtime}(?:\\/(?:api(?:\\/index)?|index))?$`);
  const namedRe =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  const nsRe =
    /import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const defRe = /import\s+[A-Za-z_$][\w$]*\s+from\s*["']([^"']+)["']/g;
  const sideRe = /import\s*["']([^"']+)["']/g;

  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    let m: RegExpExecArray | null;
    while ((m = namedRe.exec(src))) {
      const mod = m[3]!;
      const hit = mod.match(modRe);
      if (!hit) continue;
      const plug = hit[1]!;
      if (plug === selfName) continue;
      for (const raw of m[2]!.split(",")) {
        let s = raw.trim();
        if (!s) continue;
        s = s.replace(/^type\s+/, "");
        const asMatch = s.match(/^(\w+)\s+as\s+\w+$/);
        const orig = asMatch ? asMatch[1]! : s;
        if (/^\w+$/.test(orig)) uses.add(`${plug}.${orig}`);
      }
    }
    for (const re of [nsRe, defRe, sideRe]) {
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const hit = m[1]!.match(modRe);
        if (!hit) continue;
        const plug = hit[1]!;
        if (plug !== selfName) uses.add(plug);
      }
    }
  }
  return Array.from(uses).sort();
}

function parseResources(serverDir: string): { key: string; mode: string }[] {
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

function parseRegisterTokens(src: string): string[] {
  const idx = src.search(/\bregister\s*:\s*\[/);
  if (idx < 0) return [];
  const start = src.indexOf("[", idx);
  const end = matchBracket(src, start, "[", "]");
  if (end < 0) return [];
  const body = src.slice(start + 1, end).trim();
  if (!body) return [];
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      const t = cur.trim();
      if (t) tokens.push(t);
      cur = "";
      continue;
    }
    cur += c;
  }
  const t = cur.trim();
  if (t) tokens.push(t);
  return tokens;
}

function parseEntityExtensionCalls(dbFiles: string[]): RawExtRef[] {
  const out: RawExtRef[] = [];
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw || !raw.includes("defineExtension")) continue;
    const src = stripTypes(raw);
    const imports = parseImports(src);
    const re = /\bdefineExtension\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const imp = imports.get(m[1]!);
      if (!imp) continue;
      out.push({ parentVarName: imp.original, parentModule: imp.module, extName: m[2]! });
    }
  }
  return out;
}

function parseTableNamesFromDbFiles(dbFiles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of dbFiles) {
    const raw = readIfExists(f);
    if (!raw) continue;
    const src = stripTypes(raw);
    const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.set(m[1]!, m[2]!);
  }
  return out;
}

function findDbFiles(pluginDir: string): string[] {
  const serverDir = join(pluginDir, "server");
  if (!existsSync(serverDir)) return [];
  const results: string[] = [];
  function walk(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith(".ts") && e.name !== "index.ts") {
        const byName = /schema|tables?/.test(e.name.replace(/\.ts$/, ""));
        const src = byName ? null : readIfExists(full);
        const byContent = !byName && !!src && (src.includes("pgTable(") || src.includes("pgView("));
        if (byName || byContent) results.push(full);
      }
    }
  }
  walk(serverDir);
  return results.sort();
}

// ── Walk ────────────────────────────────────────────────────────────

function findAllPluginDirs(pluginsRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const hasWeb = existsSync(join(dir, "web", "index.ts"));
    const hasServer = existsSync(join(dir, "server", "index.ts"));
    const hasCentral = existsSync(join(dir, "central", "index.ts"));
    const hasShared = existsSync(join(dir, "shared", "index.ts"));
    if ((hasWeb || hasServer || hasCentral || hasShared) && dir !== pluginsRoot) out.push(dir);

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (dir === pluginsRoot) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        const sub = join(dir, e.name);
        const childEntries = readdirSync(sub, { withFileTypes: true });
        for (const c of childEntries) {
          if (c.isDirectory()) walk(join(sub, c.name), depth + 1);
        }
      }
    }
  }
  walk(pluginsRoot, 0);
  return out;
}

// ── Per-plugin collection ───────────────────────────────────────────

interface CollectedPlugin {
  node: PluginNode;
  parentDir: string | null;
}

function collectPlugin(dir: string, pluginsRoot: string): CollectedPlugin {
  const webIndex = readIfExists(join(dir, "web", "index.ts"));
  const serverIndex = readIfExists(join(dir, "server", "index.ts"));
  const centralIndex = readIfExists(join(dir, "central", "index.ts"));
  const slotsSrc = readIfExists(join(dir, "web", "slots.ts"));
  const commandsSrc = readIfExists(join(dir, "web", "commands.ts"));
  const dbFiles = findDbFiles(dir);

  const webSrc = webIndex ? stripTypes(webIndex) : null;
  const serverSrc = serverIndex ? stripTypes(serverIndex) : null;
  const centralSrc = centralIndex ? stripTypes(centralIndex) : null;

  const webDesc = webSrc ? parseStringField(webSrc, "description") : undefined;
  const serverDesc = serverSrc ? parseStringField(serverSrc, "description") : undefined;
  const centralDesc = centralSrc ? parseStringField(centralSrc, "description") : undefined;
  const descriptions: Partial<Record<Runtime, string>> = {};
  if (webDesc) descriptions.web = webDesc;
  if (serverDesc) descriptions.server = serverDesc;
  if (centralDesc) descriptions.central = centralDesc;
  const description = webDesc ?? serverDesc ?? centralDesc;

  const loadBearing =
    (webSrc ? parseBoolField(webSrc, "loadBearing") : false) ||
    (serverSrc ? parseBoolField(serverSrc, "loadBearing") : false) ||
    (centralSrc ? parseBoolField(centralSrc, "loadBearing") : false);

  const slots = slotsSrc
    ? parseDefineGroup(stripTypes(slotsSrc), "defineSlot", (memberName, slotId, groupName) => ({
        memberName,
        slotId,
        groupName,
      }))
    : [];
  const commands = commandsSrc
    ? parseDefineGroup(
        stripTypes(commandsSrc),
        "defineCommand",
        (memberName, commandId, groupName) => ({ memberName, commandId, groupName }),
      )
    : [];

  const paneDefs = parsePaneDefinitions(join(dir, "web"));

  const contributions: Contribution[] = [];
  if (webSrc) {
    const block = extractContributionsBlock(webSrc);
    if (block !== null) {
      const importMap = parseImports(webSrc);
      for (const call of findCalls(block)) {
        const [head, ...rest] = call.callee.split(".");
        const tail = rest.join(".");
        const imp = importMap.get(head!);
        const displayHead = imp && imp.original !== "default" ? imp.original : head!;
        const slot = `${displayHead}.${tail}`;
        const props = parsePropsBlock(call.argsBody);
        const contribution: Contribution = { slot, props };
        if (slot === "Pane.Register" && props["pane"]) {
          const def = paneDefs.get(props["pane"].trim());
          if (def) {
            contribution.paneId = def.id;
            contribution.panePath = def.path;
          }
        }
        contributions.push(contribution);
      }
    }
  }

  const serverHttpRoutes = serverSrc ? parseRouteMap(serverSrc, "httpRoutes") : [];
  const serverWsRoutes = serverSrc ? parseRouteMap(serverSrc, "wsRoutes") : [];
  const centralHttpRoutes = centralSrc ? parseRouteMap(centralSrc, "httpRoutes") : [];
  const centralWsRoutes = centralSrc ? parseRouteMap(centralSrc, "wsRoutes") : [];

  const webExports = webIndex ? parseBarrelExports(webIndex) : [];
  const serverExports = serverIndex ? parseBarrelExports(serverIndex) : [];
  const centralExports = centralIndex ? parseBarrelExports(centralIndex) : [];
  const sharedIndex = readIfExists(join(dir, "shared", "index.ts"));
  const sharedExports = sharedIndex ? parseBarrelExports(sharedIndex) : [];

  const serverDir = join(dir, "server");
  const serverApiUses = existsSync(serverDir) ? parseServerApiUses(serverDir, basename(dir)) : [];
  const serverResources = existsSync(serverDir) ? parseResources(serverDir) : [];
  const serverRegister = serverSrc ? parseRegisterTokens(serverSrc) : [];
  const centralDir = join(dir, "central");
  const centralApiUses = existsSync(centralDir)
    ? parseServerApiUses(centralDir, basename(dir), "central")
    : [];
  const centralResources = existsSync(centralDir) ? parseResources(centralDir) : [];
  const centralRegister = centralSrc ? parseRegisterTokens(centralSrc) : [];

  const rel = relative(pluginsRoot, dir);
  const segs = rel.split(/[\\/]+/);
  let parentDir: string | null = null;
  if (segs.length >= 3 && segs[segs.length - 2] === "plugins") {
    parentDir = join(pluginsRoot, ...segs.slice(0, segs.length - 2));
  }

  const path = rel.split("\\").join("/");

  return {
    parentDir,
    node: {
      dir,
      path,
      name: basename(dir),
      hierarchyId: "",
      description,
      descriptions,
      loadBearing,
      runtimes: {
        web: !!webIndex,
        server: !!serverIndex,
        central: !!centralIndex,
      },
      children: [],
      exports: {
        web: webExports,
        server: serverExports,
        central: centralExports,
        shared: sharedExports,
      },
      slots,
      commands,
      contributions,
      server: {
        httpRoutes: serverHttpRoutes,
        wsRoutes: serverWsRoutes,
        resources: serverResources,
        registerTokens: serverRegister,
        apiUses: serverApiUses,
      },
      central: {
        httpRoutes: centralHttpRoutes,
        wsRoutes: centralWsRoutes,
        resources: centralResources,
        registerTokens: centralRegister,
        apiUses: centralApiUses,
      },
      dbFiles,
      importedBy: [],
      slotContributors: [],
      endpointCallers: [],
      entityExtensions: [],
      extendedBy: [],
    },
  };
}

// ── Cross-plugin relationships ──────────────────────────────────────

function computeRelationships(byDir: Map<string, PluginNode>): void {
  const byName = new Map<string, PluginNode>();
  for (const info of byDir.values()) byName.set(info.name, info);

  for (const importer of byDir.values()) {
    const referenced = new Set<string>();
    for (const u of [...importer.server.apiUses, ...importer.central.apiUses]) {
      referenced.add(u.split(".")[0]!);
    }
    for (const targetName of referenced) {
      const target = byName.get(targetName);
      if (!target || target === importer) continue;
      if (!target.importedBy.includes(importer.name)) {
        target.importedBy.push(importer.name);
      }
    }
  }

  const slotGroupToOwner = new Map<string, PluginNode>();
  for (const info of byDir.values()) {
    for (const slot of info.slots) {
      if (!slotGroupToOwner.has(slot.groupName)) {
        slotGroupToOwner.set(slot.groupName, info);
      }
    }
  }
  for (const contributor of byDir.values()) {
    const groups = new Set<string>();
    for (const c of contributor.contributions) {
      const head = c.slot.split(".")[0];
      if (head) groups.add(head);
    }
    for (const group of groups) {
      const owner = slotGroupToOwner.get(group);
      if (!owner || owner === contributor) continue;
      if (!owner.slotContributors.includes(contributor.name)) {
        owner.slotContributors.push(contributor.name);
      }
    }
  }

  const apiPrefixToOwner = new Map<string, PluginNode>();
  for (const info of byDir.values()) {
    for (const route of [...info.server.httpRoutes, ...info.central.httpRoutes]) {
      const pathMatch = route.match(/^\S+\s+\/api\/([A-Za-z0-9_-]+)/);
      if (!pathMatch) continue;
      const prefix = pathMatch[1]!;
      if (!apiPrefixToOwner.has(prefix)) {
        apiPrefixToOwner.set(prefix, info);
      }
    }
  }
  if (apiPrefixToOwner.size > 0) {
    const prefixes = [...apiPrefixToOwner.keys()];
    const escaped = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`\\/api\\/(${escaped.join("|")})(?![A-Za-z0-9_-])`, "g");
    for (const caller of byDir.values()) {
      const files: string[] = [];
      for (const sub of ["web", "server", "central"]) {
        const subDir = join(caller.dir, sub);
        if (existsSync(subDir)) walkFiles(subDir, files);
      }
      const hit = new Set<string>();
      for (const f of files) {
        const src = readIfExists(f);
        if (!src) continue;
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(src))) hit.add(m[1]!);
      }
      for (const prefix of hit) {
        const owner = apiPrefixToOwner.get(prefix);
        if (!owner || owner === caller) continue;
        if (!owner.endpointCallers.includes(caller.name)) {
          owner.endpointCallers.push(caller.name);
        }
      }
    }
  }

  for (const info of byDir.values()) {
    info.importedBy.sort();
    info.slotContributors.sort();
    info.endpointCallers.sort();
  }

  const pluginVarToTable = new Map<string, Map<string, string>>();
  for (const info of byDir.values()) {
    pluginVarToTable.set(info.name, parseTableNamesFromDbFiles(info.dbFiles));
  }
  const pluginModuleRe = /@plugins\/([^/"'`]+)\/(?:server|central|shared)/;
  for (const info of byDir.values()) {
    for (const ref of parseEntityExtensionCalls(info.dbFiles)) {
      const pluginMatch = ref.parentModule.match(pluginModuleRe);
      if (!pluginMatch) continue;
      const parentPluginName = pluginMatch[1]!;
      const parentTableName =
        (pluginVarToTable.get(parentPluginName) ?? new Map()).get(ref.parentVarName) ?? "";
      const tableName = parentTableName
        ? `${parentTableName}_ext_${ref.extName}`
        : `${parentPluginName}_ext_${ref.extName}`;
      if (!info.entityExtensions.some((e) => e.tableName === tableName)) {
        info.entityExtensions.push({ parentPlugin: parentPluginName, extName: ref.extName, tableName });
      }
      const parentPlugin = byName.get(parentPluginName);
      if (parentPlugin && !parentPlugin.extendedBy.some((e) => e.tableName === tableName)) {
        parentPlugin.extendedBy.push({ childPlugin: info.name, extName: ref.extName, tableName });
      }
    }
  }
  for (const info of byDir.values()) {
    info.entityExtensions.sort((a, b) => a.tableName.localeCompare(b.tableName));
    info.extendedBy.sort((a, b) => a.tableName.localeCompare(b.tableName));
  }
}

// ── Tree assembly ───────────────────────────────────────────────────

function computeHierarchyIds(nodes: PluginNode[], parentId: string): void {
  for (const node of nodes) {
    node.hierarchyId = parentId ? `${parentId}.${node.name}` : node.name;
    computeHierarchyIds(node.children, node.hierarchyId);
  }
}

export function buildPluginTree(pluginsRoot: string): PluginTree {
  const dirs = findAllPluginDirs(pluginsRoot);
  const byDir = new Map<string, PluginNode>();
  const parentDirs = new Map<string, string | null>();

  for (const d of dirs) {
    const collected = collectPlugin(d, pluginsRoot);
    byDir.set(d, collected.node);
    parentDirs.set(d, collected.parentDir);
  }

  computeRelationships(byDir);

  const roots: PluginNode[] = [];
  for (const [dir, node] of byDir) {
    let parent = parentDirs.get(dir) ?? null;
    while (parent && !byDir.has(parent)) {
      const rel = relative(pluginsRoot, parent);
      const segs = rel.split(/[\\/]+/);
      if (segs.length >= 3 && segs[segs.length - 2] === "plugins") {
        parent = join(pluginsRoot, ...segs.slice(0, segs.length - 2));
      } else {
        parent = null;
      }
    }
    if (parent && byDir.has(parent)) {
      byDir.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: PluginNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of list) sortRec(c.children);
  };
  sortRec(roots);

  computeHierarchyIds(roots, "");

  return { pluginsRoot, byDir, roots };
}
