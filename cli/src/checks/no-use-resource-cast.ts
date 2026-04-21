import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Matches cast patterns on variables that look like useResource destructures:
//   (data as Foo)          — exact pattern from all known offenders
//   (tasksData as Foo)     — aliased destructure e.g. { data: tasksData }
//   (convsData as Foo)     — same
// Pattern: identifier ending in "data" (case-insensitive suffix) followed by " as <UpperCase>"
const CAST_PATTERN = "\\b[a-z][a-zA-Z]*[Dd]ata\\b as [A-Z]";

export const noUseResourceCast: Check = {
  id: "no-use-resource-cast",
  description:
    "useResource is generic — casting its `data` result hides type mismatches and is never necessary",
  async run() {
    const root = await getRoot();

    const proc = Bun.spawn(
      ["git", "grep", "-nE", CAST_PATTERN, "--", "*.ts", "*.tsx"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out.split("\n").filter(Boolean);

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
