import { join } from "node:path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// The five `no-adhoc-*` class rules that carry a byte-identical copy of the
// shared class-token walk. The walk is DUPLICATED (not imported) on purpose:
// lint rule files are dual-loaded under jiti — which can't resolve `@plugins/*`
// — and Bun, so no cross-plugin import works for them. This check is what keeps
// the copies in lockstep. A NEW rule that adopts the sentinel must be added
// here; a copy that drops the sentinel will fail the "missing" branch below.
const EXPECTED = [
  "plugins/primitives/plugins/text/lint/no-adhoc-typography.ts",
  "plugins/primitives/plugins/radius/lint/no-adhoc-radius.ts",
  "plugins/primitives/plugins/z-layers/lint/no-adhoc-zindex.ts",
  "plugins/primitives/plugins/control-size/lint/no-adhoc-control.ts",
  "plugins/primitives/plugins/icon-auto/lint/no-adhoc-slot-icon-size.ts",
].sort();

const START = "// >>> shared:class-token-walk";
const END = "// <<< shared:class-token-walk";

/**
 * Discover every rule file carrying the shared-walk start sentinel. Uses
 * `git grep -l` (the repo's `find`-free file-discovery primitive) so the set is
 * read straight from tracked source.
 */
async function discoverFiles(root: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "grep", "-l", "-F", START, "--", "*.ts"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  if (stdout === "") return [];
  // The shared walk only ever lives in a lint RULE file (`<plugin>/lint/*.ts`).
  // Restrict to those so this check's OWN file — which carries the sentinel text
  // inside its `START`/`END` string constants, under `check/` — isn't discovered
  // as a (spurious) participant.
  return stdout
    .split("\n")
    .filter((l) => l.length > 0 && l.includes("/lint/"))
    .sort();
}

/**
 * Extract the text strictly BETWEEN the start and end sentinel lines (exclusive
 * of both marker lines). Returns null when either marker is missing or the
 * ordering is wrong.
 */
function extractBlock(src: string): string | null {
  const lines = src.split("\n");
  const startIdx = lines.findIndex((l) => l.includes(START));
  const endIdx = lines.findIndex((l) => l.includes(END));
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  return lines.slice(startIdx + 1, endIdx).join("\n");
}

const check: Check = {
  id: "class-token-walk-in-sync",
  description:
    "The five no-adhoc-* class rules must carry a byte-identical copy of the shared class-token walk (it can't be imported — lint rules dual-load under jiti, which can't resolve @plugins/*).",
  async run() {
    const root = await getRoot();
    const found = await discoverFiles(root);

    // The discovered set must EXACTLY equal the known expected set, so a 6th
    // rule adopting the sentinel (or a copy losing it) fails loudly.
    const missing = EXPECTED.filter((p) => !found.includes(p));
    const extra = found.filter((p) => !EXPECTED.includes(p));
    if (missing.length > 0 || extra.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) {
        parts.push(`expected files missing the shared-walk sentinel: ${missing.join(", ")}`);
      }
      if (extra.length > 0) {
        parts.push(`unexpected files carrying the shared-walk sentinel: ${extra.join(", ")}`);
      }
      return {
        ok: false,
        message: parts.join("; "),
        hint:
          "Update the EXPECTED list in this check (plugins/framework/plugins/tooling/plugins/checks/plugins/class-token-walk-in-sync/check/index.ts) " +
          "to match the rules that should carry the shared class-token walk, or restore the `// >>> shared:class-token-walk` block in the rule that dropped it.",
      };
    }

    // All discovered blocks must be byte-identical.
    const blocks = new Map<string, string>();
    for (const rel of found) {
      const src = await Bun.file(join(root, rel)).text();
      const block = extractBlock(src);
      if (block === null) {
        return {
          ok: false,
          message: `${rel}: could not extract a well-formed shared-walk block (missing or mis-ordered \`${START}\` / \`${END}\` markers).`,
          hint: "Re-stamp the rule with both sentinel lines exactly as in the sibling no-adhoc-* rules.",
        };
      }
      blocks.set(rel, block);
    }

    const reference = blocks.get(EXPECTED[0]!)!;
    const differing = [...blocks.entries()].filter(([, b]) => b !== reference).map(([rel]) => rel);
    if (differing.length > 0) {
      return {
        ok: false,
        message:
          `The shared class-token walk drifted from ${EXPECTED[0]} in: ${differing.join(", ")}`,
        hint:
          "Re-stamp the differing file(s) with the EXACT block (between the sentinel lines) from " +
          `${EXPECTED[0]} so all copies are byte-identical.`,
      };
    }

    return { ok: true };
  },
};

export default check;
