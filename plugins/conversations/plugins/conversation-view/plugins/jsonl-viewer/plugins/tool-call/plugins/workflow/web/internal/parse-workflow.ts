// The Workflow tool's `script` input always begins with a pure-literal
// `export const meta = {...}` block (enforced by the tool). We extract its
// name/description/phases for display without evaluating the script.

export interface WorkflowPhase {
  title?: string;
  detail?: string;
}

export interface WorkflowMeta {
  name?: string;
  description?: string;
  phases: WorkflowPhase[];
}

export interface WorkflowResult {
  runId?: string;
  taskId?: string;
  summary?: string;
}

/** Advance past a string literal whose opening quote is at `i`. Returns the index just after the closing quote. */
function skipString(src: string, i: number): number {
  const quote = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

/** Index of the bracket that matches the `{`/`[` at `openIdx`, skipping string literals. -1 if unbalanced. */
function matchBracket(src: string, openIdx: number): number {
  const open = src[openIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function decodeStringLiteral(lit: string): string {
  const inner = lit.slice(1, -1);
  return inner.replace(/\\(['"`\\nrt])/g, (_, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return c;
    }
  });
}

/** Read the first `key: '<string>'` value in `src` (key optionally quoted). */
function readStringValue(src: string, key: string): string | undefined {
  const re = new RegExp(`(?:^|[,{[\\s])["']?${key}["']?\\s*:\\s*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const i = m.index + m[0].length;
    const q = src[i];
    if (q === "'" || q === '"' || q === "`") {
      const end = skipString(src, i);
      return decodeStringLiteral(src.slice(i, end));
    }
  }
  return undefined;
}

function extractPhases(metaSrc: string): WorkflowPhase[] {
  const m = /phases\s*:\s*\[/.exec(metaSrc);
  if (!m) return [];
  const openIdx = metaSrc.indexOf("[", m.index);
  const closeIdx = matchBracket(metaSrc, openIdx);
  if (closeIdx < 0) return [];
  const arrSrc = metaSrc.slice(openIdx + 1, closeIdx);
  const phases: WorkflowPhase[] = [];
  let i = 0;
  while (i < arrSrc.length) {
    if (arrSrc[i] === "{") {
      const end = matchBracket(arrSrc, i);
      if (end < 0) break;
      const objSrc = arrSrc.slice(i, end + 1);
      phases.push({
        title: readStringValue(objSrc, "title"),
        detail: readStringValue(objSrc, "detail"),
      });
      i = end + 1;
    } else {
      i++;
    }
  }
  return phases;
}

export function parseWorkflowMeta(script: string): WorkflowMeta | null {
  const m = /export\s+const\s+meta\s*=\s*\{/.exec(script);
  if (!m) return null;
  const openIdx = script.indexOf("{", m.index);
  const closeIdx = matchBracket(script, openIdx);
  if (closeIdx < 0) return null;
  const metaSrc = script.slice(openIdx, closeIdx + 1);
  return {
    name: readStringValue(metaSrc, "name"),
    description: readStringValue(metaSrc, "description"),
    phases: extractPhases(metaSrc),
  };
}

export function parseWorkflowResult(content: string): WorkflowResult {
  return {
    runId: /Run ID:\s*(\S+)/.exec(content)?.[1],
    taskId: /Task ID:\s*(\S+)/.exec(content)?.[1],
    summary: /Summary:\s*(.+)/.exec(content)?.[1]?.trim(),
  };
}
