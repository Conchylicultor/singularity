import ts from "typescript";
import { normalizeSegmentPattern } from "../core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function git(root: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

async function getRoot(): Promise<string> {
  return (await git(process.cwd(), ["rev-parse", "--show-toplevel"])).trim();
}

// Files that may author a pane segment: any source mentioning `Pane.define`
// (inline segment) or `defineRoute` (segment authored on the route). Tests are
// excluded — they register throwaway panes that never ship.
async function candidateFiles(root: string): Promise<string[]> {
  const out = await git(root, [
    "grep",
    "-l",
    "-e",
    "Pane.define",
    "-e",
    "defineRoute",
    "--",
    "plugins/**/*.ts",
    "plugins/**/*.tsx",
    ":(exclude)**/*.test.ts",
    ":(exclude)**/*.test.tsx",
  ]);
  return out.split("\n").filter(Boolean);
}

interface SegmentSite {
  raw: string;
  file: string;
  line: number;
}

function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

// The set of call expressions whose first-argument object literal authors a
// pane's URL segment. Mirrors the two define forms in pane/web/pane.ts.
function isSegmentDefiningCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  // `defineRoute({ ... })`
  if (ts.isIdentifier(callee) && callee.text === "defineRoute") return true;
  // `Pane.define({ ... })`
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "define" &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Pane"
  ) {
    return true;
  }
  return false;
}

function collectSegments(file: string, source: string): SegmentSite[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sites: SegmentSite[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      isSegmentDefiningCall(node) &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]!)
    ) {
      for (const prop of node.arguments[0]!.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "segment"
        ) {
          const raw = literalText(prop.initializer);
          // Non-literal segments can't be analyzed statically; in practice every
          // segment is a string literal (the runtime check is the backstop).
          if (raw === null) break;
          const line =
            sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
          sites.push({ raw, file, line });
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

const check: Check = {
  id: "pane:segments-unique",
  description:
    "pane URL segments must be globally unique (no two panes match the same URLs)",
  async run() {
    const root = await getRoot();
    const files = await candidateFiles(root);

    const byPattern = new Map<string, SegmentSite[]>();
    for (const file of files) {
      const source = await Bun.file(`${root}/${file}`).text();
      for (const site of collectSegments(file, source)) {
        // Index/empty-segment panes resolve via appPath, not URL matching —
        // multiple empties are legal (mirrors useSyncPaneRegistry).
        if (site.raw === "" || site.raw === "/") continue;
        const pattern = normalizeSegmentPattern(site.raw);
        const list = byPattern.get(pattern) ?? [];
        list.push(site);
        byPattern.set(pattern, list);
      }
    }

    const collisions = [...byPattern.entries()].filter(
      ([, sites]) => sites.length > 1,
    );
    if (collisions.length === 0) return { ok: true };

    const message =
      `${collisions.length} pane segment collision(s) — these match the same URLs:\n` +
      collisions
        .map(
          ([pattern, sites]) =>
            `  ${pattern}\n` +
            sites
              .map((s) => `    ${s.file}:${s.line}  "${s.raw}"`)
              .join("\n"),
        )
        .join("\n");

    return {
      ok: false,
      message,
      hint:
        "Pane segments (and route segments) must be globally unique — param " +
        "names don't disambiguate (`r/:runId` and `r/:reportId` both match " +
        "`r/<x>`). Rename one segment's static prefix to a distinct value. " +
        "Left unfixed, this throws at runtime on navigation.",
    };
  },
};

export default check;
