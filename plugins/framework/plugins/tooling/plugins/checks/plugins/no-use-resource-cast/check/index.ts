import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; inputKeyed?: boolean; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const CAST_PATTERN =
  "(\\b[a-z][a-zA-Z]*[Dd]ata\\b as [A-Z]|\\([^)]*[Dd]ata[^)]*\\?\\?[^)]*\\) as [A-Z])";

const check: Check = {
  id: "no-use-resource-cast",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "useResource is generic — casting its `data` result hides type mismatches and is never necessary",
  async run() {
    const root = await getRoot();
    // strings: true — this detects a code construct (an `as T` cast) that must
    // never be matched inside a string literal.
    const matches = await grepCode({
      root,
      pattern: new RegExp(CAST_PATTERN),
      grepArg: CAST_PATTERN,
      maskStrings: true,
    });

    if (matches.length === 0) return { ok: true };

    const offenders = matches.map((m) => `${m.path}:${m.line}:${m.text}`);

    return {
      ok: false,
      message: `\`as\` cast on useResource data found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "useResource<T> infers T from the ResourceDescriptor — the cast is unnecessary. " +
        "If the inferred type does not match what you need, the resource definition itself must be fixed. " +
        "If you believe you have a legitimate use-case, report the resource name and expected type to the user before writing any workaround.",
    };
  },
};

export default check;
